#!/usr/bin/env python3
"""Phase 2: incrementally upload processed server articles into AnythingLLM.

Principles:
- Never auto-create workspaces. New source accounts stay pending until explicitly mapped.
- Reuse ANYTHINGLLM_WORKSPACES as the approved source-account -> workspace registry.
- Optionally add every document to one cross-source workspace via ANYTHINGLLM_ALL_WORKSPACE_SLUG.
- Upload normalized Markdown through AnythingLLM's raw-text API, so source metadata is preserved.
- For updated articles, upload the new version first, then purge the previous AnythingLLM document.

Expected environment variables (can also be read from .env.local):
  ANYTHINGLLM_BASE_URL=http://127.0.0.1:3001
  ANYTHINGLLM_API_KEY=...
  ANYTHINGLLM_WORKSPACES={"西交利物浦大学":"xjtlu-official", ...}
  ANYTHINGLLM_ALL_WORKSPACE_SLUG=xjtlu-all-sources   # optional
  XJTLU_CONTENT_ROOT=/mnt/sdd/xjtlu-content
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_ROOT = Path(os.environ.get("XJTLU_CONTENT_ROOT", "/mnt/sdd/xjtlu-content"))
DEFAULT_ENV_FILE = Path(os.environ.get("XJTLU_ENV_FILE", ".env.local"))


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


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


def config(env_file: Path) -> tuple[str, str, dict[str, str], str | None]:
    load_env_file(env_file)
    base = os.environ.get("ANYTHINGLLM_BASE_URL", "").rstrip("/")
    key = os.environ.get("ANYTHINGLLM_API_KEY", "")
    raw_map = os.environ.get("ANYTHINGLLM_WORKSPACES", "{}")
    all_slug = os.environ.get("ANYTHINGLLM_ALL_WORKSPACE_SLUG", "").strip() or None
    if not base or not key:
        raise RuntimeError("ANYTHINGLLM_BASE_URL / ANYTHINGLLM_API_KEY are not configured")
    try:
        mapping = json.loads(raw_map)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"ANYTHINGLLM_WORKSPACES is not valid JSON: {exc}") from exc
    if not isinstance(mapping, dict):
        raise RuntimeError("ANYTHINGLLM_WORKSPACES must be a JSON object")
    clean = {str(name).strip(): str(slug).strip() for name, slug in mapping.items() if str(name).strip() and str(slug).strip()}
    return base, key, clean, all_slug


def request_json(url: str, key: str, *, method: str = "GET", payload: Any | None = None, timeout: int = 180) -> Any:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=body, method=method, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            if not raw:
                return {}
            return json.loads(raw)
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


def db_connect(root: Path) -> sqlite3.Connection:
    db_path = root / "state" / "articles.db"
    if not db_path.exists():
        raise RuntimeError(f"Phase 1 database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    existing = {row[1] for row in conn.execute("PRAGMA table_info(articles)")}
    additions = {
        "previous_anythingllm_doc_id": "TEXT",
        "sync_attempts": "INTEGER NOT NULL DEFAULT 0",
        "last_sync_attempt_at": "TEXT",
    }
    for column, definition in additions.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE articles ADD COLUMN {column} {definition}")
    conn.commit()
    return conn


def upload_document(base: str, key: str, article: sqlite3.Row, target_slugs: list[str]) -> str:
    path = Path(str(article["processed_path"] or ""))
    if not path.exists():
        raise RuntimeError(f"processed file not found: {path}")
    text = path.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        raise RuntimeError(f"processed file is empty: {path}")

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
        payload={
            "textContent": text,
            "addToWorkspaces": ",".join(dict.fromkeys(target_slugs)),
            "metadata": metadata,
        },
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
    data = request_json(
        f"{base}/api/v1/system/remove-documents",
        key,
        method="DELETE",
        payload={"names": [location]},
        timeout=180,
    )
    if isinstance(data, dict) and data.get("success") is False:
        raise RuntimeError(f"old document cleanup failed: {json.dumps(data, ensure_ascii=False)[:500]}")


def discover(conn: sqlite3.Connection, mapping: dict[str, str], live: dict[str, str], all_slug: str | None) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT account, COUNT(*) count, SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) synced, SUM(CASE WHEN status='processed' THEN 1 ELSE 0 END) processed, SUM(CASE WHEN status='pending_workspace' THEN 1 ELSE 0 END) pending, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM articles GROUP BY account ORDER BY count DESC, account"
    ).fetchall()
    sources = []
    for row in rows:
        account = str(row["account"])
        slug = mapping.get(account)
        sources.append({
            "account": account,
            "count": int(row["count"] or 0),
            "synced": int(row["synced"] or 0),
            "processed": int(row["processed"] or 0),
            "pending_workspace": int(row["pending"] or 0),
            "failed": int(row["failed"] or 0),
            "workspace": slug,
            "workspaceExists": bool(slug and slug in live),
            "approved": bool(slug),
        })
    return {
        "allWorkspace": all_slug,
        "allWorkspaceExists": bool(all_slug and all_slug in live),
        "sources": sources,
    }


def sync(root: Path, env_file: Path, limit: int, dry_run: bool, retry_failed: bool) -> dict[str, Any]:
    base, key, mapping, all_slug = config(env_file)
    live = live_workspaces(base, key)
    conn = db_connect(root)
    statuses = ["processed", "pending_workspace"] + (["failed"] if retry_failed else [])
    placeholders = ",".join("?" for _ in statuses)
    rows = conn.execute(
        f"SELECT * FROM articles WHERE status IN ({placeholders}) ORDER BY updated_at ASC LIMIT ?",
        (*statuses, max(1, limit)),
    ).fetchall()
    stats = {"considered": 0, "synced": 0, "pending_workspace": 0, "failed": 0, "dry_run": 0, "replaced": 0, "cleanup_warning": 0}
    details: list[dict[str, Any]] = []

    for article in rows:
        stats["considered"] += 1
        account = str(article["account"] or "").strip()
        source_slug = mapping.get(account)
        if not account or account == "未分类" or not source_slug:
            stats["pending_workspace"] += 1
            details.append({"article_id": article["article_id"], "account": account or "未分类", "status": "pending_workspace", "reason": "source account is not approved/mapped"})
            if not dry_run:
                conn.execute(
                    "UPDATE articles SET status='pending_workspace', last_error=?, last_sync_attempt_at=?, sync_attempts=sync_attempts+1 WHERE article_id=?",
                    ("未找到已批准的公众号 Workspace 映射", now_iso(), article["article_id"]),
                )
                conn.commit()
            continue
        if source_slug not in live:
            stats["pending_workspace"] += 1
            details.append({"article_id": article["article_id"], "account": account, "status": "pending_workspace", "reason": f"workspace slug not found: {source_slug}"})
            if not dry_run:
                conn.execute(
                    "UPDATE articles SET status='pending_workspace', last_error=?, last_sync_attempt_at=?, sync_attempts=sync_attempts+1 WHERE article_id=?",
                    (f"AnythingLLM 中不存在 Workspace: {source_slug}", now_iso(), article["article_id"]),
                )
                conn.commit()
            continue

        targets = [source_slug]
        if all_slug:
            if all_slug in live:
                targets.append(all_slug)
            else:
                details.append({"article_id": article["article_id"], "account": account, "status": "warning", "reason": f"总库不存在，先仅同步来源 Workspace: {all_slug}"})

        previous_doc = str(article["previous_anythingllm_doc_id"] or "").strip()
        if dry_run:
            stats["dry_run"] += 1
            details.append({"article_id": article["article_id"], "account": account, "status": "would_sync", "targets": targets, "wouldReplace": previous_doc or None})
            continue

        try:
            location = upload_document(base, key, article, targets)
            cleanup_warning = ""
            if previous_doc and previous_doc != location:
                try:
                    purge_document(base, key, previous_doc)
                    stats["replaced"] += 1
                except Exception as cleanup_exc:
                    cleanup_warning = str(cleanup_exc)
                    stats["cleanup_warning"] += 1

            stamp = now_iso()
            conn.execute(
                "UPDATE articles SET status='synced', anythingllm_workspace=?, anythingllm_doc_id=?, previous_anythingllm_doc_id=NULL, last_error=?, synced_at=?, updated_at=?, last_sync_attempt_at=?, sync_attempts=sync_attempts+1 WHERE article_id=?",
                (",".join(dict.fromkeys(targets)), location, cleanup_warning or None, stamp, stamp, stamp, article["article_id"]),
            )
            conn.commit()
            stats["synced"] += 1
            details.append({"article_id": article["article_id"], "account": account, "status": "synced", "targets": targets, "document": location, "cleanupWarning": cleanup_warning or None})
        except Exception as exc:
            stats["failed"] += 1
            message = str(exc)
            details.append({"article_id": article["article_id"], "account": account, "status": "failed", "reason": message})
            conn.execute(
                "UPDATE articles SET status='failed', last_error=?, last_sync_attempt_at=?, sync_attempts=sync_attempts+1 WHERE article_id=?",
                (message[:1200], now_iso(), article["article_id"]),
            )
            conn.commit()

    discovery = discover(conn, mapping, live, all_slug)
    conn.close()
    return {
        "root": str(root),
        "anythingllm": base,
        "liveWorkspaceCount": len(live),
        "stats": stats,
        "details": details,
        "discovery": discovery,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 2 server articles -> AnythingLLM incremental sync")
    parser.add_argument("command", choices=["discover", "sync", "status"])
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--env", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    env_file = Path(args.env).expanduser().resolve()
    base, key, mapping, all_slug = config(env_file)
    live = live_workspaces(base, key)
    conn = db_connect(root)

    if args.command in {"discover", "status"}:
        payload = discover(conn, mapping, live, all_slug)
        payload.update({"root": str(root), "anythingllm": base, "liveWorkspaceCount": len(live)})
        if args.command == "status":
            counts = {row["status"]: row["count"] for row in conn.execute("SELECT status, COUNT(*) count FROM articles GROUP BY status")}
            payload["status"] = counts
            payload["total"] = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        conn.close()
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    conn.close()
    result = sync(root, env_file, max(1, args.limit), args.dry_run, args.retry_failed)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["stats"]["failed"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
