#!/usr/bin/env python3
"""Repair article publication dates before AnythingLLM synchronization.

Why this exists:
Some WeChat Markdown exports do not carry YAML/frontmatter dates. Phase 1 therefore
stored published_at as empty, and AnythingLLM exposed its document ingestion timestamp
inside <document_metadata> as `published`. The model could then mistake the ingestion
time for the WeChat article publication time.

This repair is deterministic and conservative:
- inspect the original/raw article text;
- prefer a date on the WeChat header line (for example `原创 ... 2026-05-07 09:24 江苏`);
- otherwise use an explicit publication/date label near the top of the document;
- only then fall back to the first date in the first 16 non-empty lines;
- write the repaired Published At field into the processed Markdown;
- mark already-synced rows as `processed` so the existing AnythingLLM sync replaces them.

Run without --apply to preview changes.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from pathlib import Path
from typing import Iterable

DEFAULT_ROOT = Path(os.environ.get("XJTLU_CONTENT_ROOT", "/mnt/sdd/xjtlu-content"))

DATE_RE = re.compile(
    r"(?<!\d)(20\d{2})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})\s*(?:日)?"
    r"(?:[ T\u3000]+(\d{1,2})\s*[:：]\s*(\d{2})(?:\s*[:：]\s*(\d{2}))?)?"
)


def db_connect(root: Path) -> sqlite3.Connection:
    path = root / "state" / "articles.db"
    if not path.exists():
        raise RuntimeError(f"article database not found: {path}")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    columns = {row[1] for row in conn.execute("PRAGMA table_info(articles)")}
    additions = {
        "previous_anythingllm_doc_id": "TEXT",
        "sync_attempts": "INTEGER NOT NULL DEFAULT 0",
        "last_sync_attempt_at": "TEXT",
    }
    for column, definition in additions.items():
        if column not in columns:
            conn.execute(f"ALTER TABLE articles ADD COLUMN {column} {definition}")
    conn.commit()
    return conn


def iso_date(match: re.Match[str]) -> str:
    year, month, day, hour, minute, second = match.groups()
    base = f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    if hour is None:
        return base
    return f"{base}T{int(hour):02d}:{int(minute or 0):02d}:{int(second or 0):02d}+08:00"


def candidate_from_line(line: str) -> str | None:
    match = DATE_RE.search(line)
    return iso_date(match) if match else None


def meaningful_lines(text: str, limit: int = 100) -> list[str]:
    rows = [line.strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
    return rows[:limit]


def infer_published(text: str) -> tuple[str | None, str]:
    rows = meaningful_lines(text, 100)

    # Highest confidence: standard WeChat export header.
    for line in rows[:40]:
        if re.search(r"(^|\s)(原创|Original)\b|原创\s", line, re.I):
            value = candidate_from_line(line)
            if value:
                return value, "wechat-header"

    # Explicit labels/frontmatter-style metadata near the document start.
    for line in rows[:50]:
        if re.search(r"(发布日期|发布时间|发布于|published(?:_at|_date)?\s*:|date\s*:)", line, re.I):
            value = candidate_from_line(line)
            if value:
                return value, "explicit-date-label"

    # Conservative fallback: a date immediately near title/header, not deep in body.
    for line in rows[:16]:
        value = candidate_from_line(line)
        if value:
            return value, "header-fallback"

    return None, "not-found"


def existing_source_paths(row: sqlite3.Row) -> Iterable[Path]:
    for key in ("source_path", "raw_path"):
        value = str(row[key] or "").strip()
        if not value:
            continue
        path = Path(value)
        if path.exists() and path.is_file():
            yield path


def infer_for_row(row: sqlite3.Row) -> tuple[str | None, str, str | None]:
    for path in existing_source_paths(row):
        try:
            value, reason = infer_published(path.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            continue
        if value:
            return value, reason, str(path)
    return None, "not-found", None


def rewrite_processed(path_value: str | None, published: str) -> bool:
    path = Path(str(path_value or ""))
    if not path.exists() or not path.is_file():
        return False

    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    new_line = f"- Published At: {published}"

    for index, line in enumerate(lines):
        if re.match(r"^-\s*Published At\s*:", line, re.I):
            if line == new_line:
                return False
            lines[index] = new_line
            path.write_text("\n".join(lines) + ("\n" if text.endswith("\n") else ""), encoding="utf-8")
            return True

    insert_at = next((i + 1 for i, line in enumerate(lines[:20]) if re.match(r"^-\s*Article ID\s*:", line, re.I)), None)
    if insert_at is None:
        insert_at = 2 if len(lines) >= 2 else len(lines)
    lines.insert(insert_at, new_line)
    path.write_text("\n".join(lines) + ("\n" if text.endswith("\n") else ""), encoding="utf-8")
    return True


def normalize_existing(value: str | None) -> str:
    return str(value or "").strip()


def repair(root: Path, apply: bool, limit: int | None) -> dict[str, object]:
    conn = db_connect(root)
    sql = "SELECT * FROM articles ORDER BY updated_at ASC"
    params: tuple[object, ...] = ()
    if limit and limit > 0:
        sql += " LIMIT ?"
        params = (limit,)
    rows = conn.execute(sql, params).fetchall()

    stats = {
        "scanned": 0,
        "candidates": 0,
        "changed": 0,
        "processedFilesRewritten": 0,
        "queuedForResync": 0,
        "missingDate": 0,
        "apply": apply,
    }
    details: list[dict[str, object]] = []

    try:
        for row in rows:
            stats["scanned"] += 1
            inferred, reason, source_path = infer_for_row(row)
            if not inferred:
                stats["missingDate"] += 1
                continue
            stats["candidates"] += 1

            current = normalize_existing(row["published_at"])
            if current == inferred:
                continue

            stats["changed"] += 1
            detail = {
                "article_id": row["article_id"],
                "title": row["title"],
                "old": current or None,
                "new": inferred,
                "reason": reason,
                "source_path": source_path,
                "status": row["status"],
            }
            details.append(detail)

            if not apply:
                continue

            if rewrite_processed(row["processed_path"], inferred):
                stats["processedFilesRewritten"] += 1

            if row["status"] == "synced":
                previous = row["anythingllm_doc_id"] or row["previous_anythingllm_doc_id"]
                conn.execute(
                    """
                    UPDATE articles
                    SET published_at=?, status='processed', previous_anythingllm_doc_id=?,
                        anythingllm_doc_id=NULL, synced_at=NULL, last_error=NULL
                    WHERE article_id=?
                    """,
                    (inferred, previous, row["article_id"]),
                )
                stats["queuedForResync"] += 1
            else:
                conn.execute(
                    "UPDATE articles SET published_at=?, last_error=NULL WHERE article_id=?",
                    (inferred, row["article_id"]),
                )
            conn.commit()
    finally:
        conn.close()

    return {**stats, "details": details[:100]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair true WeChat publication dates in the SURF article repository.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--apply", action="store_true", help="Write changes and queue previously synced documents for replacement.")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    result = repair(root, args.apply, args.limit or None)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
