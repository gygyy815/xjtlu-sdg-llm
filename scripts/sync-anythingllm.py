#!/usr/bin/env python3
"""Incrementally sync the server Markdown corpus to AnythingLLM.

Active SURF layout:
  KB_MARKDOWN_ROOT=/mnt/sdd/knowledge-base/markdown
  KB_INDEX_PATH=/mnt/sdd/xjtlu-sdg-llm/data/full-kb-index.json
  KB_INDEX_REPORT_PATH=/mnt/sdd/xjtlu-sdg-llm/data/full-kb-index-report.json
  XJTLU_SYNC_DB=/mnt/sdd/knowledge-base/app-data/articles.db

Design:
- Markdown files remain authoritative and are never copied or rewritten.
- `init` registers unique articles from full-kb-index.json.
- Cross-folder duplicate records from full-kb-index-report.json are preserved as
  extra article -> source-account memberships instead of being discarded.
- `ensure-workspaces` makes sure every first-level source folder has a matching
  AnythingLLM Workspace, cloning settings from one template Workspace.
- Every synced article is added to all of its source Workspaces plus one
  all-sources Workspace.
- Status/doc IDs/hashes are stored in SQLite so repeated runs are resumable.
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
DEFAULT_REPORT_PATH = Path(os.environ.get("KB_INDEX_REPORT_PATH", str(PROJECT_ROOT / "data" / "full-kb-index-report.json")))
DEFAULT_DB_PATH = Path(os.environ.get("XJTLU_SYNC_DB", "/mnt/sdd/knowledge-base/app-data/articles.db"))
DEFAULT_ENV_FILE = Path(os.environ.get("XJTLU_ENV_FILE", ".env.local"))
DEFAULT_TEMPLATE_SLUG = "43274168-84dc-4b6c-a62a-85773b4ed3cf"
ALL_ACCOUNT_KEY = "__ALL_SOURCES__"

COPYABLE_WORKSPACE_FIELDS = (
    "similarityThreshold",
    "openAiTemp",
    "openAiHistory",
    "openAiPrompt",
    "queryRefusalResponse",
    "chatMode",
    "topN",
    "chatProvider",
    "chatModel",
    "agentProvider",
    "agentModel",
    "vectorSearchMode",
    "router_id",
)


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


def parse_json_mapping(raw: str, label: str) -> dict[str, str]:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{label} is not valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be a JSON object")
    return {
        str(name).strip(): str(slug).strip()
        for name, slug in value.items()
        if str(name).strip() and str(slug).strip()
    }


def resolved_paths(
    env_file: Path,
    markdown_arg: str | None,
    index_arg: str | None,
    report_arg: str | None,
    db_arg: str | None,
) -> tuple[Path, Path, Path, Path]:
    load_env_file(env_file)
    markdown_root = Path(
        markdown_arg or os.environ.get("KB_MARKDOWN_ROOT") or str(DEFAULT_MARKDOWN_ROOT)
    ).expanduser().resolve()
    index_path = Path(
        index_arg or os.environ.get("KB_INDEX_PATH") or str(DEFAULT_INDEX_PATH)
    ).expanduser().resolve()
    report_path = Path(
        report_arg or os.environ.get("KB_INDEX_REPORT_PATH") or str(DEFAULT_REPORT_PATH)
    ).expanduser().resolve()
    db_path = Path(
        db_arg or os.environ.get("XJTLU_SYNC_DB") or str(DEFAULT_DB_PATH)
    ).expanduser().resolve()
    return markdown_root, index_path, report_path, db_path


def anythingllm_config(env_file: Path) -> dict[str, Any]:
    load_env_file(env_file)
    base = os.environ.get("ANYTHINGLLM_BASE_URL", "").rstrip("/")
    key = os.environ.get("ANYTHINGLLM_API_KEY", "")
    if not base or not key:
        raise RuntimeError("ANYTHINGLLM_BASE_URL / ANYTHINGLLM_API_KEY are not configured")

    explicit = parse_json_mapping(
        os.environ.get("XJTLU_SOURCE_WORKSPACES")
        or os.environ.get("ANYTHINGLLM_WORKSPACES", "{}"),
        "XJTLU_SOURCE_WORKSPACES/ANYTHINGLLM_WORKSPACES",
    )
    return {
        "base": base,
        "key": key,
        "explicit": explicit,
        "template_slug": os.environ.get(
            "XJTLU_WORKSPACE_TEMPLATE_SLUG", DEFAULT_TEMPLATE_SLUG
        ).strip(),
        "all_slug": os.environ.get("ANYTHINGLLM_ALL_WORKSPACE_SLUG", "").strip() or None,
        "all_name": os.environ.get("XJTLU_ALL_WORKSPACE_NAME", "全部公众号").strip()
        or "全部公众号",
    }


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
          published_at TEXT,
          source_url TEXT,
          content_hash TEXT NOT NULL,
          membership_hash TEXT NOT NULL DEFAULT '',
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

        CREATE TABLE IF NOT EXISTS article_memberships (
          article_id TEXT NOT NULL,
          account TEXT NOT NULL,
          relative_path TEXT,
          PRIMARY KEY(article_id, account),
          FOREIGN KEY(article_id) REFERENCES articles(article_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspace_registry (
          account TEXT PRIMARY KEY,
          workspace_slug TEXT NOT NULL,
          workspace_name TEXT NOT NULL,
          source TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_memberships_account ON article_memberships(account);

        CREATE TABLE IF NOT EXISTS registry_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          indexed INTEGER NOT NULL DEFAULT 0,
          created INTEGER NOT NULL DEFAULT 0,
          changed INTEGER NOT NULL DEFAULT 0,
          unchanged INTEGER NOT NULL DEFAULT 0,
          membership_changed INTEGER NOT NULL DEFAULT 0,
          memberships INTEGER NOT NULL DEFAULT 0,
          missing_files INTEGER NOT NULL DEFAULT 0
        );
        """
    )

    existing = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(articles)").fetchall()
    }
    if "membership_hash" not in existing:
        conn.execute("ALTER TABLE articles ADD COLUMN membership_hash TEXT NOT NULL DEFAULT ''")
    conn.commit()
    return conn


def safe_markdown_path(markdown_root: Path, relative_path: str) -> Path:
    candidate = (markdown_root / relative_path).resolve()
    try:
        candidate.relative_to(markdown_root)
    except ValueError as exc:
        raise RuntimeError(
            f"article path escapes KB_MARKDOWN_ROOT: {relative_path}"
        ) from exc
    return candidate


def top_folder(relative_path: str) -> str:
    clean = str(relative_path or "").replace("\\", "/").strip("/")
    return clean.split("/", 1)[0].strip() if clean else ""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(values: list[str]) -> str:
    payload = "\n".join(sorted(set(values))).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_json(path: Path, expected: type) -> Any:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"JSON file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"JSON file is invalid: {path}: {exc}") from exc
    if not isinstance(payload, expected):
        raise RuntimeError(f"Unexpected JSON shape in {path}")
    return payload


def build_memberships(
    index: list[dict[str, Any]], report: dict[str, Any]
) -> dict[str, dict[str, str]]:
    memberships: dict[str, dict[str, str]] = {}

    def add(article_id: str, relative_path: str) -> None:
        account = top_folder(relative_path)
        if not article_id or not account:
            return
        memberships.setdefault(article_id, {})
        memberships[article_id].setdefault(account, relative_path)

    for item in index:
        add(str(item.get("id") or "").strip(), str(item.get("relativePath") or "").strip())

    for row in report.get("duplicateIds", []) or []:
        if not isinstance(row, dict):
            continue
        article_id = str(row.get("id") or "").strip()
        add(article_id, str(row.get("firstRelativePath") or "").strip())
        add(article_id, str(row.get("relativePath") or "").strip())

    return memberships


def init_registry(
    markdown_root: Path,
    index_path: Path,
    report_path: Path,
    db_path: Path,
) -> dict[str, Any]:
    if not markdown_root.is_dir():
        raise RuntimeError(
            f"KB_MARKDOWN_ROOT does not identify a directory: {markdown_root}"
        )

    index = load_json(index_path, list)
    report = load_json(report_path, dict)
    memberships = build_memberships(index, report)

    conn = db_connect(db_path)
    run_id = conn.execute(
        "INSERT INTO registry_runs(started_at) VALUES (?)", (now_iso(),)
    ).lastrowid
    stats = {
        "indexed": 0,
        "created": 0,
        "changed": 0,
        "unchanged": 0,
        "membership_changed": 0,
        "memberships": 0,
        "missing_files": 0,
    }
    missing: list[dict[str, str]] = []

    try:
        for item in index:
            article_id = str(item.get("id") or "").strip()
            relative_path = str(item.get("relativePath") or "").strip()
            title = str(item.get("title") or "").strip()
            if not article_id or not relative_path or not title:
                continue

            stats["indexed"] += 1
            source_path = safe_markdown_path(markdown_root, relative_path)
            if not source_path.is_file():
                stats["missing_files"] += 1
                if len(missing) < 50:
                    missing.append(
                        {"article_id": article_id, "relative_path": relative_path}
                    )
                continue

            content_hash = sha256_file(source_path)
            published_at = str(item.get("publishedAt") or "").strip() or None
            source_url = str(item.get("sourceUrl") or "").strip() or None
            accounts = sorted(memberships.get(article_id, {}).keys())
            membership_hash = stable_hash(accounts)
            existing = conn.execute(
                "SELECT * FROM articles WHERE article_id=?", (article_id,)
            ).fetchone()
            stamp = now_iso()

            if existing is None:
                conn.execute(
                    """INSERT INTO articles(
                       article_id,relative_path,title,published_at,source_url,
                       content_hash,membership_hash,status,first_seen_at,updated_at
                    ) VALUES(?,?,?,?,?,?,?,'pending',?,?)""",
                    (
                        article_id,
                        relative_path,
                        title,
                        published_at,
                        source_url,
                        content_hash,
                        membership_hash,
                        stamp,
                        stamp,
                    ),
                )
                stats["created"] += 1
            else:
                content_changed = str(existing["content_hash"]) != content_hash
                memberships_changed = (
                    str(existing["membership_hash"] or "") != membership_hash
                )
                if content_changed or memberships_changed:
                    previous_doc = (
                        str(existing["anythingllm_doc_id"] or "").strip()
                        or str(existing["previous_anythingllm_doc_id"] or "").strip()
                        or None
                    )
                    conn.execute(
                        """UPDATE articles SET
                           relative_path=?,title=?,published_at=?,source_url=?,
                           content_hash=?,membership_hash=?,status='pending',
                           previous_anythingllm_doc_id=?,anythingllm_doc_id=NULL,
                           anythingllm_workspace=NULL,synced_at=NULL,last_error=NULL,
                           updated_at=?
                           WHERE article_id=?""",
                        (
                            relative_path,
                            title,
                            published_at,
                            source_url,
                            content_hash,
                            membership_hash,
                            previous_doc,
                            stamp,
                            article_id,
                        ),
                    )
                    stats["changed"] += 1
                    if memberships_changed:
                        stats["membership_changed"] += 1
                else:
                    conn.execute(
                        """UPDATE articles SET
                           relative_path=?,title=?,published_at=?,source_url=?
                           WHERE article_id=?""",
                        (
                            relative_path,
                            title,
                            published_at,
                            source_url,
                            article_id,
                        ),
                    )
                    stats["unchanged"] += 1

            conn.execute(
                "DELETE FROM article_memberships WHERE article_id=?", (article_id,)
            )
            for account, member_path in memberships.get(article_id, {}).items():
                conn.execute(
                    """INSERT INTO article_memberships(article_id,account,relative_path)
                       VALUES(?,?,?)""",
                    (article_id, account, member_path),
                )
                stats["memberships"] += 1

        conn.execute(
            """UPDATE registry_runs SET
               finished_at=?,indexed=?,created=?,changed=?,unchanged=?,
               membership_changed=?,memberships=?,missing_files=?
               WHERE id=?""",
            (
                now_iso(),
                stats["indexed"],
                stats["created"],
                stats["changed"],
                stats["unchanged"],
                stats["membership_changed"],
                stats["memberships"],
                stats["missing_files"],
                run_id,
            ),
        )
        conn.commit()
        total = int(
            conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
        )
        source_count = int(
            conn.execute(
                "SELECT COUNT(DISTINCT account) FROM article_memberships"
            ).fetchone()[0]
        )
        multi_count = int(
            conn.execute(
                """SELECT COUNT(*) FROM (
                     SELECT article_id FROM article_memberships
                     GROUP BY article_id HAVING COUNT(*) > 1
                   )"""
            ).fetchone()[0]
        )
        relation_count = int(
            conn.execute("SELECT COUNT(*) FROM article_memberships").fetchone()[0]
        )
        return {
            "ok": True,
            "markdownRoot": str(markdown_root),
            "indexPath": str(index_path),
            "reportPath": str(report_path),
            "database": str(db_path),
            "registryTotal": total,
            "sourceCount": source_count,
            "membershipRelations": relation_count,
            "multiWorkspaceArticles": multi_count,
            "stats": stats,
            "missingExamples": missing,
        }
    finally:
        conn.close()


def request_json(
    url: str,
    key: str,
    *,
    method: str = "GET",
    payload: Any | None = None,
    timeout: int = 180,
) -> Any:
    body = (
        None
        if payload is None
        else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    )
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, data=body, method=method, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {exc.code}: {raw[:900] or exc.reason}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Connection error: {exc.reason}") from exc


def list_workspaces(base: str, key: str) -> list[dict[str, Any]]:
    data = request_json(f"{base}/api/v1/workspaces", key)
    rows = data.get("workspaces", []) if isinstance(data, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def workspace_maps(
    rows: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_slug: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    for row in rows:
        slug = str(row.get("slug") or "").strip()
        name = str(row.get("name") or "").strip()
        if slug:
            by_slug[slug] = row
        if name:
            by_name[name] = row
    return by_slug, by_name


def get_workspace(base: str, key: str, slug: str) -> dict[str, Any]:
    data = request_json(f"{base}/api/v1/workspace/{slug}", key)
    rows = data.get("workspace", []) if isinstance(data, dict) else []
    if not isinstance(rows, list) or not rows:
        raise RuntimeError(f"Workspace not found: {slug}")
    if not isinstance(rows[0], dict):
        raise RuntimeError(f"Unexpected workspace response for: {slug}")
    return rows[0]


def template_settings(workspace: dict[str, Any]) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    for field in COPYABLE_WORKSPACE_FIELDS:
        if field in workspace and workspace.get(field) is not None:
            settings[field] = workspace.get(field)
    return settings


def deterministic_source_slug(account: str) -> str:
    return "xjtlu-source-" + hashlib.sha256(account.encode("utf-8")).hexdigest()[:12]


def create_workspace_clone(
    base: str,
    key: str,
    *,
    display_name: str,
    slug_seed_name: str,
    settings: dict[str, Any],
) -> dict[str, Any]:
    payload = {"name": slug_seed_name, **settings}
    created = request_json(
        f"{base}/api/v1/workspace/new",
        key,
        method="POST",
        payload=payload,
    )
    workspace = created.get("workspace") if isinstance(created, dict) else None
    if not isinstance(workspace, dict) or not workspace.get("slug"):
        raise RuntimeError(
            f"AnythingLLM did not create workspace {display_name}: "
            f"{json.dumps(created, ensure_ascii=False)[:900]}"
        )
    slug = str(workspace["slug"]).strip()

    if display_name != slug_seed_name:
        updated = request_json(
            f"{base}/api/v1/workspace/{slug}/update",
            key,
            method="POST",
            payload={"name": display_name},
        )
        updated_workspace = (
            updated.get("workspace") if isinstance(updated, dict) else None
        )
        if isinstance(updated_workspace, dict):
            workspace = updated_workspace
        else:
            workspace["name"] = display_name
    return workspace


def upsert_workspace_registry(
    conn: sqlite3.Connection,
    *,
    account: str,
    slug: str,
    name: str,
    source: str,
) -> None:
    conn.execute(
        """INSERT INTO workspace_registry(
             account,workspace_slug,workspace_name,source,updated_at
           ) VALUES(?,?,?,?,?)
           ON CONFLICT(account) DO UPDATE SET
             workspace_slug=excluded.workspace_slug,
             workspace_name=excluded.workspace_name,
             source=excluded.source,
             updated_at=excluded.updated_at""",
        (account, slug, name, source, now_iso()),
    )


def ensure_workspaces(
    db_path: Path,
    env_file: Path,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    cfg = anythingllm_config(env_file)
    base = cfg["base"]
    key = cfg["key"]
    explicit: dict[str, str] = cfg["explicit"]
    template_slug = cfg["template_slug"]
    all_slug_config = cfg["all_slug"]
    all_name = cfg["all_name"]

    conn = db_connect(db_path)
    accounts = [
        str(row["account"])
        for row in conn.execute(
            "SELECT DISTINCT account FROM article_memberships ORDER BY account"
        )
        if str(row["account"] or "").strip()
    ]
    if not accounts:
        conn.close()
        raise RuntimeError(
            "No article memberships found. Run sync:anythingllm:init first."
        )

    live = list_workspaces(base, key)
    by_slug, by_name = workspace_maps(live)
    template = get_workspace(base, key, template_slug)
    settings = template_settings(template)

    result = {
        "template": {
            "name": template.get("name"),
            "slug": template.get("slug"),
            "copiedFields": sorted(settings.keys()),
        },
        "sources": len(accounts),
        "existing": 0,
        "created": 0,
        "wouldCreate": 0,
        "items": [],
        "allWorkspace": None,
    }

    all_workspace: dict[str, Any] | None = None
    all_source = ""
    if all_slug_config and all_slug_config in by_slug:
        all_workspace = by_slug[all_slug_config]
        all_source = "configured-slug"
    elif all_name in by_name:
        all_workspace = by_name[all_name]
        all_source = "name-match"
    elif "xjtlu-all-sources" in by_slug:
        all_workspace = by_slug["xjtlu-all-sources"]
        all_source = "legacy-slug"

    if all_workspace is None:
        if dry_run:
            result["allWorkspace"] = {
                "name": all_name,
                "slug": "xjtlu-all-sources",
                "status": "would_create",
                "template": template_slug,
            }
        else:
            all_workspace = create_workspace_clone(
                base,
                key,
                display_name=all_name,
                slug_seed_name="xjtlu-all-sources",
                settings=settings,
            )
            all_source = "created"
            live = list_workspaces(base, key)
            by_slug, by_name = workspace_maps(live)
    if all_workspace is not None:
        all_slug = str(all_workspace.get("slug") or "").strip()
        all_display = str(all_workspace.get("name") or all_name).strip()
        if not dry_run:
            upsert_workspace_registry(
                conn,
                account=ALL_ACCOUNT_KEY,
                slug=all_slug,
                name=all_display,
                source=all_source,
            )
        result["allWorkspace"] = {
            "name": all_display,
            "slug": all_slug,
            "status": all_source,
        }

    for account in accounts:
        workspace: dict[str, Any] | None = None
        source = ""

        explicit_slug = explicit.get(account)
        if explicit_slug and explicit_slug in by_slug:
            workspace = by_slug[explicit_slug]
            source = "explicit-mapping"
        elif account in by_name:
            workspace = by_name[account]
            source = "name-match"
        else:
            stable_slug = deterministic_source_slug(account)
            if stable_slug in by_slug:
                workspace = by_slug[stable_slug]
                source = "stable-slug"

        if workspace is None:
            if dry_run:
                result["wouldCreate"] += 1
                result["items"].append(
                    {
                        "account": account,
                        "status": "would_create",
                        "slug": deterministic_source_slug(account),
                    }
                )
                continue
            workspace = create_workspace_clone(
                base,
                key,
                display_name=account,
                slug_seed_name=deterministic_source_slug(account),
                settings=settings,
            )
            source = "created"
            result["created"] += 1
            live = list_workspaces(base, key)
            by_slug, by_name = workspace_maps(live)
        else:
            result["existing"] += 1

        slug = str(workspace.get("slug") or "").strip()
        display = str(workspace.get("name") or account).strip()
        if not dry_run:
            upsert_workspace_registry(
                conn,
                account=account,
                slug=slug,
                name=display,
                source=source,
            )
        result["items"].append(
            {
                "account": account,
                "status": source,
                "name": display,
                "slug": slug,
            }
        )

    if not dry_run:
        conn.commit()
    conn.close()
    return result


def registry_workspace_map(conn: sqlite3.Connection) -> dict[str, str]:
    return {
        str(row["account"]): str(row["workspace_slug"])
        for row in conn.execute(
            "SELECT account,workspace_slug FROM workspace_registry"
        )
    }


def article_accounts(conn: sqlite3.Connection, article_id: str) -> list[str]:
    return [
        str(row["account"])
        for row in conn.execute(
            """SELECT account FROM article_memberships
               WHERE article_id=? ORDER BY account""",
            (article_id,),
        )
    ]


def target_slugs_for_article(
    conn: sqlite3.Connection,
    article_id: str,
    workspace_map: dict[str, str],
) -> tuple[list[str], list[str]]:
    accounts = article_accounts(conn, article_id)
    missing = [account for account in accounts if account not in workspace_map]
    targets = [
        workspace_map[account]
        for account in accounts
        if account in workspace_map
    ]
    all_slug = workspace_map.get(ALL_ACCOUNT_KEY)
    if all_slug:
        targets.append(all_slug)
    else:
        missing.append(ALL_ACCOUNT_KEY)
    return list(dict.fromkeys(targets)), missing


def upload_document(
    base: str,
    key: str,
    article: sqlite3.Row,
    markdown_root: Path,
    target_slugs: list[str],
    accounts: list[str],
) -> str:
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
        "docAuthor": " / ".join(accounts),
        "description": (
            "XJTLU WeChat article | Source Workspaces: "
            + " | ".join(accounts)
            + f" | Article ID: {article['article_id']}"
        ),
        "docSource": str(
            article["source_url"]
            or f"xjtlu://wechat/{article['article_id']}"
        ),
        "chunkSource": str(article["source_url"] or " / ".join(accounts)),
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
            "addToWorkspaces": ",".join(target_slugs),
            "metadata": metadata,
        },
        timeout=300,
    )
    if not isinstance(data, dict) or not data.get("success"):
        raise RuntimeError(
            f"AnythingLLM upload failed: "
            f"{json.dumps(data, ensure_ascii=False)[:900]}"
        )
    documents = data.get("documents") or []
    if not isinstance(documents, list) or not documents:
        raise RuntimeError(
            "AnythingLLM upload succeeded but returned no document location"
        )
    first = documents[0] if isinstance(documents[0], dict) else {}
    location = str(first.get("location") or first.get("name") or "").strip()
    if not location:
        raise RuntimeError(
            "AnythingLLM returned a document without location/name"
        )
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
        raise RuntimeError(
            f"old document cleanup failed: "
            f"{json.dumps(data, ensure_ascii=False)[:500]}"
        )


def sync(
    db_path: Path,
    markdown_root: Path,
    env_file: Path,
    limit: int,
    dry_run: bool,
    retry_failed: bool,
) -> dict[str, Any]:
    cfg = anythingllm_config(env_file)
    base = cfg["base"]
    key = cfg["key"]

    conn = db_connect(db_path)
    workspace_map = registry_workspace_map(conn)
    if not workspace_map:
        conn.close()
        raise RuntimeError(
            "Workspace registry is empty. Run sync:anythingllm:ensure-workspaces first."
        )

    statuses = ["pending", "pending_workspace"] + (
        ["failed"] if retry_failed else []
    )
    placeholders = ",".join("?" for _ in statuses)
    rows = conn.execute(
        f"""SELECT * FROM articles
            WHERE status IN ({placeholders})
            ORDER BY updated_at ASC,article_id ASC
            LIMIT ?""",
        (*statuses, max(1, limit)),
    ).fetchall()

    stats = {
        "considered": 0,
        "synced": 0,
        "pending_workspace": 0,
        "failed": 0,
        "dry_run": 0,
        "replaced": 0,
        "cleanup_warning": 0,
    }
    details: list[dict[str, Any]] = []

    for article in rows:
        stats["considered"] += 1
        article_id = str(article["article_id"])
        accounts = article_accounts(conn, article_id)
        targets, missing = target_slugs_for_article(
            conn, article_id, workspace_map
        )

        if missing:
            reason = "missing workspace mapping: " + ", ".join(missing)
            stats["pending_workspace"] += 1
            details.append(
                {
                    "article_id": article_id,
                    "accounts": accounts,
                    "status": "pending_workspace",
                    "reason": reason,
                }
            )
            if not dry_run:
                conn.execute(
                    """UPDATE articles SET
                       status='pending_workspace',last_error=?,
                       last_sync_attempt_at=?,sync_attempts=sync_attempts+1
                       WHERE article_id=?""",
                    (reason[:1200], now_iso(), article_id),
                )
                conn.commit()
            continue

        previous_doc = str(
            article["previous_anythingllm_doc_id"] or ""
        ).strip()

        if dry_run:
            stats["dry_run"] += 1
            details.append(
                {
                    "article_id": article_id,
                    "accounts": accounts,
                    "status": "would_sync",
                    "targets": targets,
                    "wouldReplace": previous_doc or None,
                }
            )
            continue

        try:
            location = upload_document(
                base,
                key,
                article,
                markdown_root,
                targets,
                accounts,
            )
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
                """UPDATE articles SET
                   status='synced',anythingllm_workspace=?,
                   anythingllm_doc_id=?,previous_anythingllm_doc_id=NULL,
                   last_error=?,synced_at=?,updated_at=?,
                   last_sync_attempt_at=?,sync_attempts=sync_attempts+1
                   WHERE article_id=?""",
                (
                    ",".join(targets),
                    location,
                    cleanup_warning or None,
                    stamp,
                    stamp,
                    stamp,
                    article_id,
                ),
            )
            conn.commit()
            stats["synced"] += 1
            details.append(
                {
                    "article_id": article_id,
                    "accounts": accounts,
                    "status": "synced",
                    "targets": targets,
                    "document": location,
                    "cleanupWarning": cleanup_warning or None,
                }
            )
        except Exception as exc:
            stats["failed"] += 1
            message = str(exc)
            details.append(
                {
                    "article_id": article_id,
                    "accounts": accounts,
                    "status": "failed",
                    "reason": message,
                }
            )
            conn.execute(
                """UPDATE articles SET
                   status='failed',last_error=?,last_sync_attempt_at=?,
                   sync_attempts=sync_attempts+1
                   WHERE article_id=?""",
                (message[:1200], now_iso(), article_id),
            )
            conn.commit()

    conn.close()
    return {
        "database": str(db_path),
        "markdownRoot": str(markdown_root),
        "anythingllm": base,
        "stats": stats,
        "details": details,
    }


def local_status(db_path: Path) -> dict[str, Any]:
    conn = db_connect(db_path)
    counts = {
        str(row["status"]): int(row["count"])
        for row in conn.execute(
            "SELECT status,COUNT(*) count FROM articles GROUP BY status"
        )
    }
    total = int(conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0])
    membership_relations = int(
        conn.execute("SELECT COUNT(*) FROM article_memberships").fetchone()[0]
    )
    source_count = int(
        conn.execute(
            "SELECT COUNT(DISTINCT account) FROM article_memberships"
        ).fetchone()[0]
    )
    multi_workspace = int(
        conn.execute(
            """SELECT COUNT(*) FROM (
                 SELECT article_id FROM article_memberships
                 GROUP BY article_id HAVING COUNT(*) > 1
               )"""
        ).fetchone()[0]
    )
    workspaces = [
        dict(row)
        for row in conn.execute(
            """SELECT account,workspace_name,workspace_slug,source,updated_at
               FROM workspace_registry ORDER BY account"""
        )
    ]
    top_sources = [
        dict(row)
        for row in conn.execute(
            """SELECT m.account,COUNT(*) article_count,
                      SUM(CASE WHEN a.status='synced' THEN 1 ELSE 0 END) synced
               FROM article_memberships m
               JOIN articles a ON a.article_id=m.article_id
               GROUP BY m.account
               ORDER BY article_count DESC,m.account"""
        )
    ]
    last_run = conn.execute(
        "SELECT * FROM registry_runs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return {
        "database": str(db_path),
        "totalUniqueArticles": total,
        "membershipRelations": membership_relations,
        "sourceCount": source_count,
        "multiWorkspaceArticles": multi_workspace,
        "status": counts,
        "workspaceRegistry": workspaces,
        "sources": top_sources,
        "lastRegistryRun": dict(last_run) if last_run else None,
    }


def discover(db_path: Path, env_file: Path) -> dict[str, Any]:
    cfg = anythingllm_config(env_file)
    live = list_workspaces(cfg["base"], cfg["key"])
    by_slug, by_name = workspace_maps(live)
    conn = db_connect(db_path)
    registered = registry_workspace_map(conn)
    accounts = [
        str(row["account"])
        for row in conn.execute(
            "SELECT DISTINCT account FROM article_memberships ORDER BY account"
        )
    ]
    items = []
    for account in accounts:
        slug = registered.get(account)
        items.append(
            {
                "account": account,
                "registeredSlug": slug,
                "registeredExists": bool(slug and slug in by_slug),
                "nameMatchSlug": (
                    str(by_name[account].get("slug"))
                    if account in by_name
                    else None
                ),
            }
        )
    all_slug = registered.get(ALL_ACCOUNT_KEY)
    conn.close()
    return {
        "anythingllm": cfg["base"],
        "liveWorkspaceCount": len(live),
        "sourceCount": len(accounts),
        "allWorkspace": {
            "registeredSlug": all_slug,
            "exists": bool(all_slug and all_slug in by_slug),
        },
        "sources": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Markdown corpus -> AnythingLLM incremental sync"
    )
    parser.add_argument(
        "command",
        choices=["init", "ensure-workspaces", "discover", "sync", "status"],
    )
    parser.add_argument("--env", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--markdown-root")
    parser.add_argument("--index")
    parser.add_argument("--report")
    parser.add_argument("--db")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--retry-failed", action="store_true")
    args = parser.parse_args()

    env_file = Path(args.env).expanduser().resolve()
    markdown_root, index_path, report_path, db_path = resolved_paths(
        env_file,
        args.markdown_root,
        args.index,
        args.report,
        args.db,
    )

    if args.command == "init":
        print(
            json.dumps(
                init_registry(
                    markdown_root,
                    index_path,
                    report_path,
                    db_path,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.command == "status":
        print(
            json.dumps(
                local_status(db_path),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.command == "ensure-workspaces":
        print(
            json.dumps(
                ensure_workspaces(
                    db_path,
                    env_file,
                    dry_run=args.dry_run,
                ),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if args.command == "discover":
        print(
            json.dumps(
                discover(db_path, env_file),
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    result = sync(
        db_path,
        markdown_root,
        env_file,
        max(1, args.limit),
        args.dry_run,
        args.retry_failed,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["stats"]["failed"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
