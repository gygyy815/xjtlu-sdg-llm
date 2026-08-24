#!/usr/bin/env python3
"""Incrementally sync the server Markdown corpus to AnythingLLM.

Active SURF layout:
  KB_MARKDOWN_ROOT=/mnt/sdd/knowledge-base/markdown
  KB_INDEX_PATH=/mnt/sdd/xjtlu-sdg-llm/data/full-kb-index.json
  XJTLU_SYNC_DB=/mnt/sdd/knowledge-base/app-data/articles.db

The Markdown corpus is authoritative and is never copied or rewritten. `init`
builds/refreshes a lightweight SQLite registry from the full KB index. `sync`
only uploads rows whose status is pending/pending_workspace (plus failed rows
when --retry-failed is used), so repeated runs are resumable.

Workspace policy:
- Never auto-create workspaces.
- XJTLU_SOURCE_WORKSPACES is the approved source-account -> workspace registry.
  ANYTHINGLLM_WORKSPACES is used as a backwards-compatible fallback.
- ANYTHINGLLM_ALL_WORKSPACE_SLUG optionally defines a cross-source workspace.
- XJTLU_SYNC_UNMAPPED_TO_ALL=true lets identified, unmapped sources enter the
  all-sources workspace. Empty/未分类 sources remain blocked.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MARKDOWN_ROOT = Path(os.environ.get("KB_MARKDOWN_ROOT", "/mnt/sdd/knowledge-base/markdown"))
DEFAULT_INDEX_PATH = Path(os.environ.get("KB_INDEX_PATH", str(PROJECT_ROOT / "data" / "full-kb-index.json")))
DEFAULT_DB_PATH = Path(os.environ.get("XJTLU_SYNC_DB", "/mnt/sdd/knowledge-base/app-data/articles.db"))
DEFAULT_ENV_FILE = Path(os.environ.get("XJTLU_ENV_FILE", ".env.local"))


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def resolved_paths(env_file: Path, markdown_arg: str | None, index_arg: str | None, db_arg: str | None) -> tuple[Path, Path, Path]:
    load_env_file(env_file)
    markdown_root = Path(markdown_arg or os.environ.get("KB_MARKDOWN_ROOT") or str(DEFAULT_MARKDOWN_ROOT)).expanduser().resolve()
    index_path = Path(index_arg or os.environ.get("KB_INDEX_PATH") or str(DEFAULT_INDEX_PATH)).expanduser().resolve()
    db_path = Path(db_arg or os.environ.get("XJTLU_SYNC_DB") or str(DEFAULT_DB_PATH)).expanduser().resolve()
    return markdown_root, index_path, db_path


def anythingllm_config(env_file: Path) -> tuple[str, str, dict[str, str], str | None, bool]:
    load_env_file(env_file)
    base = os.environ.get("ANYTHINGLLM_BASE_URL", "").rstrip("/")
    key = os.environ.get("ANYTHINGLLM_API_KEY", "")
    raw_map = os.environ.get("XJTLU_SOURCE_WORKSPACES") or os.environ.get("ANYTHINGLLM_WORKSPACES", "{}")
    all_slug = os.environ.get("ANYTHINGLLM_ALL_WORKSPACE_SLUG", "").strip() or None
    allow_unmapped_to_all = truthy(os.environ.get("XJTLU_SYNC_UNMAPPED_TO_ALL"))
    if not base or not key:
        raise RuntimeError("ANYTHINGLLM_BASE_URL / ANYTHINGLLM_API_KEY are not configured")
    try:
        mapping = json.loads(raw_map)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"source workspace registry is not valid JSON: {exc}") from exc
    if not isinstance(mapping, dict):
        raise RuntimeError("source workspace registry must be a JSON object")
    clean = {str(name).strip(): str(slug).strip() for name, slug in mapping.items() if str(name).strip() and str(slug).strip()}
    return base, key, clean, all_slug, allow_unmapped_to_all


def db_connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS articles (
          article_id TEXT PRIMARY KEY,
          relative_path TEXT NOT NULL,
          title TEXT NOT NULL,
          account TEXT NOT NULL,
          published_at TEXT,
          source_url TEXT,
          content_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          anythingllm_workspace TEXT,
          anythingllm_doc_id TEXT,
          previous_anythingllm_doc_id TEXT,
          last_error TEXT,
          sync_attempts INTEGER NOT NULL DEFAULT 0,
          first_seen_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT,
          last_sync_attempt_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_articles_account ON articles(account);
        CREATE INDEX IF NOT EXISTS idx_articles_updated ON articles(updated_at);
        CREATE TABLE IF NOT EXISTS registry_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          indexed INTEGER NOT NULL DEFAULT 0,
          created INTEGER NOT NULL DEFAULT 0,
          changed INTEGER NOT NULL DEFAULT 0,
          unchanged INTEGER NOT NULL DEFAULT 0,
          missing_files INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.commit()
    return conn


def safe_markdown_path(markdown_root: Path, relative_path: str) -> Path:
    candidate = (markdown_root / relative_path).resolve()
    try:
        candidate.relative_to(markdown_root)
    except ValueError as exc:
        raise RuntimeError(f"article path escapes KB_MARKDOWN_ROOT: {relative_path}") from exc
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_index(index_path: Path) -> list[dict[str, Any]]:
    try:
        payload = json.loads(index_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"KB index not found: {index_path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"KB index is invalid JSON: {index_path}: {exc}") from exc
    if not isinstance(payload, list):
        raise RuntimeError(f"KB index must contain a JSON array: {index_path}")
    return [item for item in payload if isinstance(item, dict)]


def init_registry(markdown_root: Path, index_path: Path, db_path: Path) -> dict[str, Any]:
    if not markdown_root.is_dir():
        raise RuntimeError(f"KB_MARKDOWN_ROOT does not identify a directory: {markdown_root}")
    index = load_index(index_path)
    conn = db_connect(db_path)
    run_id = conn.execute("INSERT INTO registry_runs(started_at) VALUES (?)", (now_iso(),)).lastrowid
    stats = {"indexed": 0, "created": 0, "changed": 0, "unchanged": 0, "missing_files": 0}
    missing: list[dict[str, str]] = []
    try:
        for item in index:
            article_id = str(item.get("id") or "").strip()
            relative_path = str(item.get("relativePath") or "").strip()
            title = str(item.get("title") or "").strip()
            account = str(item.get("account") or "").strip()
            if not article_id or not relative_path or not title:
                continue
            stats["indexed"] += 1
            source_path = safe_markdown_path(markdown_root, relative_path)
            if not source_path.is_file():
                stats["missing_files"] += 1
                if len(missing) < 50:
                    missing.append({"article_id": article_id, "relative_path": relative_path})
                continue
            content_hash = sha256_file(source_path)
            published_at = str(item.get("publishedAt") or "").strip() or None
            source_url = str(item.get("sourceUrl") or "").strip() or None
            existing = conn.execute("SELECT * FROM articles WHERE article_id=?", (article_id,)).fetchone()
            stamp = now_iso()
            if existing is None:
                conn.execute(
                    "INSERT INTO articles(article_id,relative_path,title,account,published_at,source_url,content_hash,status,first_seen_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',?,?)",
                    (article_id, relative_path, title, account, published_at, source_url, content_hash, stamp, stamp),
                )
                stats["created"] += 1
            elif str(existing["content_hash"]) != content_hash:
                previous_doc = str(existing["anythingllm_doc_id"] or "").strip() or str(existing["previous_anythingllm_doc_id"] or "").strip() or None
                conn.execute(
                    """UPDATE articles SET relative_path=?,title=?,account=?,published_at=?,source_url=?,content_hash=?,status='pending',previous_anythingllm_doc_id=?,anythingllm_doc_id=NULL,anythingllm_workspace=NULL,synced_at=NULL,last_error=NULL,updated_at=? WHERE article_id=?""",
                    (relative_path, title, account, published_at, source_url, content_hash, previous_doc, stamp, article_id),
                )
                stats["changed"] += 1
            else:
                conn.execute(
                    "UPDATE articles SET relative_path=?,title=?,account=?,published_at=?,source_url=? WHERE article_id=?",
                    (relative_path, title, account, published_at, source_url, article_id),
                )
                stats["unchanged"] += 1
        conn.execute(
            "UPDATE registry_runs SET finished_at=?,indexed=?,created=?,changed=?,unchanged=?,missing_files=? WHERE id=?",
            (now_iso(), stats["indexed"], stats["created"], stats["changed"], stats["unchanged"], stats["missing_files"], run_id),
        )
        conn.commit()
        total = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        return {"ok": True, "markdownRoot": str(markdown_root), "indexPath": str(index_path), "database": str(db_path), "registryTotal": int(total), "stats": stats, "missingExamples": missing}
    finally:
        conn.close()


def request_json(url: str, key: str, *, method: str = "GET", payload: Any | None = None, timeout: int = 180) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=body, method=method, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {raw[:900] or exc.reason}") from exc
    except URLError as exc:
        raise RuntimeError(f"Connection error: {exc.reason}") from exc


def live_workspaces(base: str, key: str) -> dict[str, str]:
    data = request_json(f"{base}/api/v1/workspaces", key)
    rows = data.get("workspaces", []) if isinstance(data, dict) else []
    result: dict[str, str] = {}
    for item in rows if isinstance(rows, list) else []:
        if not isinstance(item, dict):
            continue
        slug = str(item.get("slug") or "").strip()
        name = str(item.get("name") or slug).strip()
        if slug:
            result[slug] = name
    return result


def source_policy(account: str, mapping: dict[str, str], live: dict[str, str], all_slug: str | None, allow_unmapped_to_all: bool) -> tuple[list[str], str, str]:
    if not account or account == "未分类":
        return [], "pending_workspace", "source account is missing"
    source_slug = mapping.get(account)
    if source_slug:
        if source_slug not in live:
            return [], "pending_workspace", f"mapped workspace does not exist: {source_slug}"
        targets = [source_slug]
        if all_slug and all_slug in live:
            targets.append(all_slug)
        return list(dict.fromkeys(targets)), "source+all" if len(targets) > 1 else "source-only", ""
    if allow_unmapped_to_all and all_slug and all_slug in live:
        return [all_slug], "all-only", ""
    return [], "pending_workspace", "source account is not approved/mapped"


def discover(conn: sqlite3.Connection, mapping: dict[str, str], live: dict[str, str], all_slug: str | None, allow_unmapped_to_all: bool) -> dict[str, Any]:
    rows = conn.execute("""SELECT account,COUNT(*) count,SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) synced,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='pending_workspace' THEN 1 ELSE 0 END) pending_workspace,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM articles GROUP BY account ORDER BY count DESC,account""").fetchall()
    sources = []
    for row in rows:
        account = str(row["account"])
        slug = mapping.get(account)
        targets, policy, reason = source_policy(account, mapping, live, all_slug, allow_unmapped_to_all)
        sources.append({"account": account, "count": int(row["count"] or 0), "synced": int(row["synced"] or 0), "pending": int(row["pending"] or 0), "pending_workspace": int(row["pending_workspace"] or 0), "failed": int(row["failed"] or 0), "workspace": slug, "workspaceExists": bool(slug and slug in live), "approved": bool(slug), "policy": policy, "targets": targets, "reason": reason or None})
    return {"allWorkspace": all_slug, "allWorkspaceExists": bool(all_slug and all_slug in live), "allowUnmappedToAll": allow_unmapped_to_all, "sources": sources}


def upload_document(base: str, key: str, article: sqlite3.Row, markdown_root: Path, target_slugs: list[str]) -> str:
    path = safe_markdown_path(markdown_root, str(article["relative_path"]))
    if not path.is_file():
        raise RuntimeError(f"Markdown file not found: {path}")
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        raise RuntimeError(f"Markdown file is empty: {path}")
    published_ms: int | None = None
    raw_published = str(article["published_at"] or "").strip()
    if raw_published:
        try:
            parsed = datetime.fromisoformat(raw_published.replace("Z", "+00:00"))
            published_ms = int(parsed.timestamp() * 1000)
        except Exception:
            published_ms = None
    metadata: dict[str, Any] = {
        "title": str(article["title"]),
        "docAuthor": str(article["account"]),
        "description": f"XJTLU WeChat article | Source Account: {article['account']} | Article ID: {article['article_id']}",
        "docSource": str(article["source_url"] or f"xjtlu://wechat/{article['account']}/{article['article_id']}"),
        "chunkSource": str(article["source_url"] or article["account"]),
        "url": str(article["source_url"] or "") or None,
    }
    if published_ms is not None:
        metadata["published"] = published_ms
    data = request_json(
        f"{base}/api/v1/document/raw-text",
        key,
        method="POST",
        payload={"textContent": text, "addToWorkspaces": ",".join(dict.fromkeys(target_slugs)), "metadata": metadata},
        timeout=300,
    )
    if not isinstance(data, dict) or not data.get("success"):
        raise RuntimeError(f"AnythingLLM upload failed: {json.dumps(data, ensure_ascii=False)[:900]}")
    documents = data.get("documents") or []
    if not isinstance(documents, list) or not documents:
        raise RuntimeError("AnythingLLM upload succeeded but returned no document location")
    first = documents[0] if isinstance(documents[0], dict) else {}
    location = str(first.get("location") or first.get("name") or "").strip()
    if not location:
        raise RuntimeError("AnythingLLM returned a document without location/name")
    return location


def purge_document(base: str, key: str, location: str) -> None:
    if not location:
        return
    data = request_json(f"{base}/api/v1/system/remove-documents", key, method="DELETE", payload={"names": [location]}, timeout=180)
    if isinstance(data, dict) and data.get("success") is False:
        raise RuntimeError(f"old document cleanup failed: {json.dumps(data, ensure_ascii=False)[:500]}")


def sync(db_path: Path, markdown_root: Path, env_file: Path, limit: int, dry_run: bool, retry_failed: bool) -> dict[str, Any]:
    base, key, mapping, all_slug, allow_unmapped_to_all = anythingllm_config(env_file)
    live = live_workspaces(base, key)
    conn = db_connect(db_path)
    statuses = ["pending", "pending_workspace"] + (["failed"] if retry_failed else [])
    placeholders = ",".join("?" for _ in statuses)
    rows = conn.execute(f"SELECT * FROM articles WHERE status IN ({placeholders}) ORDER BY updated_at ASC,article_id ASC LIMIT ?", (*statuses, max(1, limit))).fetchall()
    stats = {"considered": 0, "synced": 0, "pending_workspace": 0, "failed": 0, "dry_run": 0, "replaced": 0, "cleanup_warning": 0, "all_only": 0}
    details: list[dict[str, Any]] = []
    for article in rows:
        stats["considered"] += 1
        account = str(article["account"] or "").strip()
        targets, policy, reason = source_policy(account, mapping, live, all_slug, allow_unmapped_to_all)
        if not targets:
            stats["pending_workspace"] += 1
            details.append({"article_id": article["article_id"], "account": account or "未分类", "status": "pending_workspace", "reason": reason})
            if not dry_run:
                conn.execute("UPDATE articles SET status='pending_workspace',last_error=?,last_sync_attempt_at=?,sync_attempts=sync_attempts+1 WHERE article_id=?", (reason[:1200], now_iso(), article["article_id"]))
                conn.commit()
            continue
        if policy == "all-only":
            stats["all_only"] += 1
        previous_doc = str(article["previous_anythingllm_doc_id"] or "").strip()
        if dry_run:
            stats["dry_run"] += 1
            details.append({"article_id": article["article_id"], "account": account, "status": "would_sync", "policy": policy, "targets": targets, "wouldReplace": previous_doc or None})
            continue
        try:
            location = upload_document(base, key, article, markdown_root, targets)
            cleanup_warning = ""
            if previous_doc and previous_doc != location:
                try:
                    purge_document(base, key, previous_doc)
                    stats["replaced"] += 1
                except Exception as cleanup_exc:
                    cleanup_warning = str(cleanup_exc)
                    stats["cleanup_warning"] += 1
            stamp = now_iso()
            conn.execute("""UPDATE articles SET status='synced',anythingllm_workspace=?,anythingllm_doc_id=?,previous_anythingllm_doc_id=NULL,last_error=?,synced_at=?,updated_at=?,last_sync_attempt_at=?,sync_attempts=sync_attempts+1 WHERE article_id=?""", (",".join(targets), location, cleanup_warning or None, stamp, stamp, stamp, article["article_id"]))
            conn.commit()
            stats["synced"] += 1
            details.append({"article_id": article["article_id"], "account": account, "status": "synced", "policy": policy, "targets": targets, "document": location, "cleanupWarning": cleanup_warning or None})
        except Exception as exc:
            stats["failed"] += 1
            message = str(exc)
            details.append({"article_id": article["article_id"], "account": account, "status": "failed", "reason": message})
            conn.execute("UPDATE articles SET status='failed',last_error=?,last_sync_attempt_at=?,sync_attempts=sync_attempts+1 WHERE article_id=?", (message[:1200], now_iso(), article["article_id"]))
            conn.commit()
    discovery = discover(conn, mapping, live, all_slug, allow_unmapped_to_all)
    conn.close()
    return {"database": str(db_path), "markdownRoot": str(markdown_root), "anythingllm": base, "liveWorkspaceCount": len(live), "stats": stats, "details": details, "discovery": discovery}


def local_status(db_path: Path) -> dict[str, Any]:
    conn = db_connect(db_path)
    counts = {str(row["status"]): int(row["count"]) for row in conn.execute("SELECT status,COUNT(*) count FROM articles GROUP BY status")}
    total = int(conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0])
    top_sources = [dict(row) for row in conn.execute("""SELECT account,COUNT(*) count,SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) synced,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='pending_workspace' THEN 1 ELSE 0 END) pending_workspace,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM articles GROUP BY account ORDER BY count DESC,account LIMIT 50""")]
    last_run = conn.execute("SELECT * FROM registry_runs ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    return {"database": str(db_path), "total": total, "status": counts, "topSources": top_sources, "lastRegistryRun": dict(last_run) if last_run else None}


def main() -> None:
    parser = argparse.ArgumentParser(description="Markdown corpus -> AnythingLLM incremental sync")
    parser.add_argument("command", choices=["init", "discover", "sync", "status"])
    parser.add_argument("--env", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--markdown-root")
    parser.add_argument("--index")
    parser.add_argument("--db")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()
    env_file = Path(args.env).expanduser().resolve()
    markdown_root, index_path, db_path = resolved_paths(env_file, args.markdown_root, args.index, args.db)
    if args.command == "init":
        print(json.dumps(init_registry(markdown_root, index_path, db_path), ensure_ascii=False, indent=2))
        return
    if args.command == "status":
        print(json.dumps(local_status(db_path), ensure_ascii=False, indent=2))
        return
    base, key, mapping, all_slug, allow_unmapped_to_all = anythingllm_config(env_file)
    live = live_workspaces(base, key)
    if args.command == "discover":
        conn = db_connect(db_path)
        payload = discover(conn, mapping, live, all_slug, allow_unmapped_to_all)
        payload.update({"database": str(db_path), "markdownRoot": str(markdown_root), "anythingllm": base, "liveWorkspaceCount": len(live), "liveWorkspaces": live})
        conn.close()
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    result = sync(db_path, markdown_root, env_file, max(1, args.limit), args.dry_run, args.retry_failed)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["stats"]["failed"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
