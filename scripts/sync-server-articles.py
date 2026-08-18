#!/usr/bin/env python3
"""Phase 1 server article repository for SURF.

Scans XJTLU_CONTENT_ROOT/incoming, archives original files, writes normalized
Markdown into processed/, and records incremental state in SQLite.

Source-account resolution order:
1. Explicit metadata in the article (source_account / account / wechat_account / publisher / source_name)
2. First folder below incoming/ (e.g. incoming/西交利物浦大学/article.md)
3. "未分类" when no reliable source is available

This means all公众号文章 can live in one physical incoming folder, as long as each
article carries explicit source-account metadata. The scanner never guesses a source.

Supported files: .md, .txt, .html, .htm, .json
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SUPPORTED = {".md", ".txt", ".html", ".htm", ".json"}
DEFAULT_ROOT = Path(os.environ.get("XJTLU_CONTENT_ROOT", "/mnt/sdd/xjtlu-content"))
SOURCE_KEYS = [
    "source_account",
    "sourceaccount",
    "account",
    "wechat_account",
    "wechataccount",
    "公众号",
    "publisher",
    "source_name",
    "sourcename",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def slug(value: str) -> str:
    value = re.sub(r"[\\/:*?\"<>|]+", "_", value).strip(" ._")
    return value[:110] or "untitled"


def normalize_body(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def strip_html(value: str) -> str:
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", value)
    value = re.sub(r"(?i)<br\s*/?>", "\n", value)
    value = re.sub(r"(?i)</p>|</div>|</h[1-6]>", "\n", value)
    value = re.sub(r"(?s)<[^>]+>", "", value)
    return normalize_body(html.unescape(value))


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}, text
    raw = text[4:end]
    body = text[end + 5 :]
    meta: dict[str, Any] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip().lower()] = value.strip().strip('"\'')
    return meta, body


def first_heading(text: str) -> str | None:
    match = re.search(r"(?m)^#\s+(.+?)\s*$", text)
    return match.group(1).strip() if match else None


def first_url(text: str) -> str | None:
    match = re.search(r"https?://mp\.weixin\.qq\.com/[^\s<>\"')]+", text)
    return match.group(0).rstrip(".,;，。；") if match else None


def metadata_source(meta: dict[str, Any]) -> str | None:
    lower = {str(key).lower(): value for key, value in meta.items()}
    for key in SOURCE_KEYS:
        value = lower.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text and not text.startswith("http://") and not text.startswith("https://"):
            return text
    return None


def load_article(path: Path, folder_source: str | None) -> dict[str, Any]:
    suffix = path.suffix.lower()
    raw = path.read_text(encoding="utf-8", errors="replace")
    meta: dict[str, Any] = {}

    if suffix == ".json":
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("JSON root must be an object")
        meta = {str(k).lower(): v for k, v in payload.items()}
        body = str(payload.get("content") or payload.get("body") or payload.get("text") or "")
    elif suffix in {".html", ".htm"}:
        body = strip_html(raw)
        title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
        if title_match:
            meta["title"] = html.unescape(re.sub(r"\s+", " ", title_match.group(1))).strip()
        # Some exporters keep metadata in HTML meta tags.
        for match in re.finditer(r'(?is)<meta[^>]+(?:name|property)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']*)["\']', raw):
            meta.setdefault(match.group(1).lower(), html.unescape(match.group(2)).strip())
    else:
        fm, body = parse_frontmatter(raw)
        meta.update(fm)

    body = normalize_body(body)
    if not body:
        raise ValueError("article body is empty")

    account = metadata_source(meta) or (folder_source if folder_source and folder_source != "未分类" else None) or "未分类"
    title = str(meta.get("title") or first_heading(body) or path.stem).strip()
    source_url = str(
        meta.get("source_url")
        or meta.get("sourceurl")
        or meta.get("url")
        or meta.get("link")
        or first_url(raw)
        or ""
    ).strip() or None
    published = str(
        meta.get("published_at")
        or meta.get("published_date")
        or meta.get("date")
        or meta.get("published")
        or ""
    ).strip() or None
    article_id = str(meta.get("article_id") or meta.get("id") or "").strip() or None

    digest = hashlib.sha256(normalize_body(body).encode("utf-8")).hexdigest()
    if not article_id:
        seed = source_url or f"{account}|{title}|{digest[:16]}"
        article_id = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:24]

    return {
        "article_id": article_id,
        "account": account,
        "title": title,
        "source_url": source_url,
        "published_at": published,
        "body": body,
        "content_hash": digest,
    }


def ensure_dirs(root: Path) -> None:
    for name in ["incoming", "raw", "processed", "assets", "state", "logs", "failed"]:
        (root / name).mkdir(parents=True, exist_ok=True)


def db_connect(root: Path) -> sqlite3.Connection:
    state = root / "state"
    state.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(state / "articles.db")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS articles (
          article_id TEXT PRIMARY KEY,
          account TEXT NOT NULL,
          title TEXT NOT NULL,
          source_url TEXT,
          published_at TEXT,
          source_path TEXT NOT NULL,
          raw_path TEXT,
          processed_path TEXT,
          content_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          anythingllm_workspace TEXT,
          anythingllm_doc_id TEXT,
          last_error TEXT,
          first_seen_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_source_url
        ON articles(source_url) WHERE source_url IS NOT NULL AND source_url <> '';
        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_articles_account ON articles(account);
        CREATE TABLE IF NOT EXISTS sync_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          scanned INTEGER NOT NULL DEFAULT 0,
          created INTEGER NOT NULL DEFAULT 0,
          updated INTEGER NOT NULL DEFAULT 0,
          unchanged INTEGER NOT NULL DEFAULT 0,
          failed INTEGER NOT NULL DEFAULT 0,
          note TEXT
        );
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(articles)")}
    migrations = {
        "previous_anythingllm_doc_id": "TEXT",
        "sync_attempts": "INTEGER NOT NULL DEFAULT 0",
        "last_sync_attempt_at": "TEXT",
    }
    for column, definition in migrations.items():
        if column not in columns:
            conn.execute(f"ALTER TABLE articles ADD COLUMN {column} {definition}")
    conn.commit()
    return conn


def lookup_existing(conn: sqlite3.Connection, article: dict[str, Any]) -> sqlite3.Row | None:
    if article.get("source_url"):
        row = conn.execute("SELECT * FROM articles WHERE source_url = ?", (article["source_url"],)).fetchone()
        if row:
            return row
    return conn.execute("SELECT * FROM articles WHERE article_id = ?", (article["article_id"],)).fetchone()


def write_processed(root: Path, article: dict[str, Any]) -> Path:
    account_dir = root / "processed" / slug(article["account"])
    account_dir.mkdir(parents=True, exist_ok=True)
    out = account_dir / f"{article['article_id']}.md"
    lines = [
        f"# {article['title']}",
        "",
        f"- Source Account: {article['account']}",
        f"- Article ID: {article['article_id']}",
    ]
    if article.get("published_at"):
        lines.append(f"- Published At: {article['published_at']}")
    if article.get("source_url"):
        lines.append(f"- Source URL: {article['source_url']}")
    lines += ["", "## 正文", "", article["body"], ""]
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def archive_raw(root: Path, source: Path, account: str, article_id: str) -> Path:
    raw_dir = root / "raw" / slug(account)
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / f"{article_id}{source.suffix.lower()}"
    if source.resolve() != target.resolve():
        shutil.copy2(source, target)
    return target


def scan(root: Path, dry_run: bool = False) -> dict[str, int]:
    ensure_dirs(root)
    incoming = root / "incoming"
    conn = db_connect(root)
    started = now_iso()
    run_id = conn.execute("INSERT INTO sync_runs(started_at) VALUES (?)", (started,)).lastrowid
    stats = {"scanned": 0, "created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    try:
        files = sorted(p for p in incoming.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED and not p.name.startswith("_"))
        for path in files:
            stats["scanned"] += 1
            try:
                rel = path.relative_to(incoming)
                folder_source = rel.parts[0] if len(rel.parts) > 1 else None
                article = load_article(path, folder_source)
                existing = lookup_existing(conn, article)

                if existing and existing["content_hash"] == article["content_hash"]:
                    stats["unchanged"] += 1
                    continue

                raw_path = archive_raw(root, path, article["account"], article["article_id"])
                processed_path = write_processed(root, article)
                stamp = now_iso()

                if dry_run:
                    stats["updated" if existing else "created"] += 1
                    continue

                if existing:
                    previous_doc = existing["anythingllm_doc_id"] or existing["previous_anythingllm_doc_id"]
                    conn.execute(
                        """
                        UPDATE articles SET article_id=?, account=?, title=?, source_url=?, published_at=?,
                          source_path=?, raw_path=?, processed_path=?, content_hash=?, status='processed',
                          previous_anythingllm_doc_id=?, anythingllm_doc_id=NULL, synced_at=NULL,
                          last_error=NULL, updated_at=?
                        WHERE article_id=?
                        """,
                        (
                            article["article_id"], article["account"], article["title"], article["source_url"],
                            article["published_at"], str(path), str(raw_path), str(processed_path), article["content_hash"],
                            previous_doc, stamp, existing["article_id"],
                        ),
                    )
                    stats["updated"] += 1
                else:
                    conn.execute(
                        """
                        INSERT INTO articles(article_id,account,title,source_url,published_at,source_path,raw_path,
                          processed_path,content_hash,status,first_seen_at,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?,'processed',?,?)
                        """,
                        (
                            article["article_id"], article["account"], article["title"], article["source_url"],
                            article["published_at"], str(path), str(raw_path), str(processed_path), article["content_hash"],
                            stamp, stamp,
                        ),
                    )
                    stats["created"] += 1
                conn.commit()
            except Exception as exc:
                stats["failed"] += 1
                sys.stderr.write(f"[FAILED] {path}: {exc}\n")

        conn.execute(
            """
            UPDATE sync_runs SET finished_at=?, scanned=?, created=?, updated=?, unchanged=?, failed=?, note=?
            WHERE id=?
            """,
            (now_iso(), stats["scanned"], stats["created"], stats["updated"], stats["unchanged"], stats["failed"], "dry-run" if dry_run else "phase-1", run_id),
        )
        conn.commit()
        return stats
    finally:
        conn.close()


def status(root: Path) -> None:
    ensure_dirs(root)
    conn = db_connect(root)
    counts = {row["status"]: row["count"] for row in conn.execute("SELECT status, COUNT(*) count FROM articles GROUP BY status")}
    total = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    accounts = [dict(row) for row in conn.execute(
        "SELECT account, COUNT(*) count, SUM(CASE WHEN status='processed' THEN 1 ELSE 0 END) processed, SUM(CASE WHEN status='synced' THEN 1 ELSE 0 END) synced, SUM(CASE WHEN status='pending_workspace' THEN 1 ELSE 0 END) pending_workspace, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM articles GROUP BY account ORDER BY count DESC, account"
    )]
    last = conn.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1").fetchone()
    print(json.dumps({
        "root": str(root),
        "total": total,
        "status": counts,
        "accounts": accounts,
        "unclassified": next((row["count"] for row in accounts if row["account"] == "未分类"), 0),
        "last_run": dict(last) if last else None,
    }, ensure_ascii=False, indent=2))
    conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan server-side article files into the SURF Phase-1 repository.")
    parser.add_argument("command", choices=["init", "scan", "status"])
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()

    if args.command == "init":
        ensure_dirs(root)
        conn = db_connect(root)
        conn.close()
        print(f"Initialized article repository at {root}")
    elif args.command == "scan":
        result = scan(root, args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        status(root)


if __name__ == "__main__":
    main()
