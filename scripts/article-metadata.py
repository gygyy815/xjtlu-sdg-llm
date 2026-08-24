#!/usr/bin/env python3
"""SURF Data Layer v1.0 metadata registry tooling.

This script prepares the server-side article registry for authoritative metadata
and future SDG tagging. It intentionally DOES NOT infer SDG labels.

Commands:
  migrate       Add structured metadata columns to state/articles.db.
  audit         Report metadata completeness and SDG review status.
  export        Export the current metadata registry as JSONL.
  sdg-template  Export a CSV template for later article-level SDG tagging.
  sdg-import    Import reviewed SDG labels from a CSV file.

Environment:
  XJTLU_CONTENT_ROOT=/mnt/sdd/xjtlu-content

The SDG import format is designed around the project rule that each article may
have 0-3 SDG goals, with targets preferred when available. Only reviewed rows
are intended for future SDG-aware retrieval.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path(os.environ.get("XJTLU_CONTENT_ROOT", "/mnt/sdd/xjtlu-content"))
METADATA_VERSION = "1.0"
REVIEW_STATUSES = {"unreviewed", "needs_review", "reviewed", "not_applicable"}
LABEL_SOURCES = {"unknown", "manual", "agent", "import"}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def db_path(root: Path) -> Path:
    return root / "state" / "articles.db"


def connect(root: Path) -> sqlite3.Connection:
    path = db_path(root)
    if not path.exists():
        raise RuntimeError(f"Article database not found: {path}. Run sync:server first.")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    existing = {row[1] for row in conn.execute("PRAGMA table_info(articles)")}
    additions = {
        "metadata_version": "TEXT NOT NULL DEFAULT '1.0'",
        "language": "TEXT",
        "content_type": "TEXT",
        "audience_json": "TEXT NOT NULL DEFAULT '[]'",
        "validity_status": "TEXT NOT NULL DEFAULT 'unknown'",
        "sdg_goals_json": "TEXT NOT NULL DEFAULT '[]'",
        "sdg_targets_json": "TEXT NOT NULL DEFAULT '[]'",
        "sdg_review_status": "TEXT NOT NULL DEFAULT 'unreviewed'",
        "sdg_label_source": "TEXT NOT NULL DEFAULT 'unknown'",
        "sdg_notes": "TEXT",
        "sdg_reviewed_at": "TEXT",
        "sdg_reviewed_by": "TEXT",
        "metadata_updated_at": "TEXT",
    }
    for column, definition in additions.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE articles ADD COLUMN {column} {definition}")

    conn.execute(
        "UPDATE articles SET metadata_version=? WHERE metadata_version IS NULL OR TRIM(metadata_version)=''",
        (METADATA_VERSION,),
    )
    conn.execute("UPDATE articles SET audience_json='[]' WHERE audience_json IS NULL OR TRIM(audience_json)=''")
    conn.execute("UPDATE articles SET validity_status='unknown' WHERE validity_status IS NULL OR TRIM(validity_status)=''")
    conn.execute("UPDATE articles SET sdg_goals_json='[]' WHERE sdg_goals_json IS NULL OR TRIM(sdg_goals_json)=''")
    conn.execute("UPDATE articles SET sdg_targets_json='[]' WHERE sdg_targets_json IS NULL OR TRIM(sdg_targets_json)=''")
    conn.execute("UPDATE articles SET sdg_review_status='unreviewed' WHERE sdg_review_status IS NULL OR TRIM(sdg_review_status)=''")
    conn.execute("UPDATE articles SET sdg_label_source='unknown' WHERE sdg_label_source IS NULL OR TRIM(sdg_label_source)=''")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_articles_sdg_review_status ON articles(sdg_review_status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at)")
    conn.commit()


def json_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in re.split(r"[;,，；|]+", text) if item.strip()]


def normalize_goal(value: str) -> str:
    text = value.strip().upper().replace("GOAL", "SDG").replace("SDG-", "SDG ")
    match = re.fullmatch(r"(?:SDG\s*)?(1[0-7]|[1-9])", text)
    if not match:
        raise ValueError(f"Invalid SDG goal: {value!r}")
    return f"SDG {int(match.group(1))}"


def normalize_target(value: str) -> str:
    text = value.strip().upper().replace("TARGET", "").replace("SDG", "").strip()
    match = re.fullmatch(r"(1[0-7]|[1-9])\.([0-9]+|[A-Z])", text)
    if not match:
        raise ValueError(f"Invalid SDG target: {value!r}")
    return f"{int(match.group(1))}.{match.group(2).lower()}"


def validate_sdg(goals_raw: Any, targets_raw: Any) -> tuple[list[str], list[str]]:
    goals = []
    for item in json_list(goals_raw):
        goal = normalize_goal(item)
        if goal not in goals:
            goals.append(goal)

    targets = []
    for item in json_list(targets_raw):
        target = normalize_target(item)
        if target not in targets:
            targets.append(target)
        derived = f"SDG {target.split('.', 1)[0]}"
        if derived not in goals:
            goals.append(derived)

    if len(goals) > 3:
        raise ValueError(f"At most 3 SDG goals are allowed; received {len(goals)}: {goals}")
    return goals, targets


def migrate(root: Path) -> None:
    conn = connect(root)
    ensure_schema(conn)
    columns = [row[1] for row in conn.execute("PRAGMA table_info(articles)")]
    count = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]
    conn.close()
    print(json.dumps({
        "ok": True,
        "metadataVersion": METADATA_VERSION,
        "database": str(db_path(root)),
        "articleCount": count,
        "metadataColumns": [name for name in columns if name.startswith("sdg_") or name in {"metadata_version", "language", "content_type", "audience_json", "validity_status", "metadata_updated_at"}],
    }, ensure_ascii=False, indent=2))


def audit(root: Path) -> None:
    conn = connect(root)
    ensure_schema(conn)
    total = conn.execute("SELECT COUNT(*) FROM articles").fetchone()[0]

    def count(where: str, params: tuple[Any, ...] = ()) -> int:
        return int(conn.execute(f"SELECT COUNT(*) FROM articles WHERE {where}", params).fetchone()[0])

    review_rows = conn.execute(
        "SELECT sdg_review_status status, COUNT(*) count FROM articles GROUP BY sdg_review_status ORDER BY count DESC"
    ).fetchall()
    source_rows = conn.execute(
        "SELECT account, COUNT(*) count FROM articles GROUP BY account ORDER BY count DESC, account LIMIT 30"
    ).fetchall()
    ready = count(
        "TRIM(COALESCE(title,''))<>'' AND TRIM(COALESCE(account,''))<>'' AND account<>'未分类' "
        "AND TRIM(COALESCE(source_url,''))<>'' AND TRIM(COALESCE(published_at,''))<>''"
    )
    tagged_reviewed = count("sdg_review_status='reviewed' AND sdg_goals_json<>'[]'")
    reviewed_no_sdg = count("sdg_review_status='reviewed' AND sdg_goals_json='[]'")

    payload = {
        "metadataVersion": METADATA_VERSION,
        "root": str(root),
        "total": total,
        "coreMetadata": {
            "readyForTagging": ready,
            "missingSourceAccount": count("account='未分类' OR TRIM(COALESCE(account,''))=''"),
            "missingSourceUrl": count("TRIM(COALESCE(source_url,''))=''"),
            "missingPublishedAt": count("TRIM(COALESCE(published_at,''))=''"),
            "missingProcessedFilePath": count("TRIM(COALESCE(processed_path,''))=''"),
        },
        "sdg": {
            "reviewStatus": {str(row["status"]): int(row["count"]) for row in review_rows},
            "reviewedWithLabels": tagged_reviewed,
            "reviewedWithNoApplicableLabel": reviewed_no_sdg,
            "eligibleForFutureSdgRetrieval": tagged_reviewed,
        },
        "topSources": [dict(row) for row in source_rows],
        "note": "SDG labels are not inferred by this tool. Future SDG-aware retrieval should use reviewed labels only.",
    }
    conn.close()
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def row_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "article_id": row["article_id"],
        "title": row["title"],
        "source_account": row["account"],
        "source_url": row["source_url"],
        "published_at": row["published_at"],
        "status": row["status"],
        "language": row["language"],
        "content_type": row["content_type"],
        "audience": json_list(row["audience_json"]),
        "validity_status": row["validity_status"],
        "sdg_goals": json_list(row["sdg_goals_json"]),
        "sdg_targets": json_list(row["sdg_targets_json"]),
        "sdg_review_status": row["sdg_review_status"],
        "sdg_label_source": row["sdg_label_source"],
        "sdg_notes": row["sdg_notes"],
        "sdg_reviewed_at": row["sdg_reviewed_at"],
        "sdg_reviewed_by": row["sdg_reviewed_by"],
        "metadata_version": row["metadata_version"],
        "metadata_updated_at": row["metadata_updated_at"],
    }


def export_jsonl(root: Path, output: Path) -> None:
    conn = connect(root)
    ensure_schema(conn)
    rows = conn.execute("SELECT * FROM articles ORDER BY account, published_at, title").fetchall()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row_payload(row), ensure_ascii=False) + "\n")
    conn.close()
    print(json.dumps({"ok": True, "rows": len(rows), "output": str(output)}, ensure_ascii=False, indent=2))


def export_sdg_template(root: Path, output: Path, only_unreviewed: bool) -> None:
    conn = connect(root)
    ensure_schema(conn)
    sql = "SELECT * FROM articles"
    params: tuple[Any, ...] = ()
    if only_unreviewed:
        sql += " WHERE sdg_review_status IN ('unreviewed','needs_review')"
    sql += " ORDER BY account, published_at, title"
    rows = conn.execute(sql, params).fetchall()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "article_id", "title", "source_account", "published_at", "source_url",
            "sdg_goals", "sdg_targets", "sdg_review_status", "sdg_label_source",
            "sdg_reviewed_by", "sdg_notes",
        ])
        for row in rows:
            writer.writerow([
                row["article_id"], row["title"], row["account"], row["published_at"] or "", row["source_url"] or "",
                "; ".join(json_list(row["sdg_goals_json"])),
                "; ".join(json_list(row["sdg_targets_json"])),
                row["sdg_review_status"] or "unreviewed",
                row["sdg_label_source"] or "unknown",
                row["sdg_reviewed_by"] or "",
                row["sdg_notes"] or "",
            ])
    conn.close()
    print(json.dumps({"ok": True, "rows": len(rows), "output": str(output)}, ensure_ascii=False, indent=2))


def find_article(conn: sqlite3.Connection, article_id: str, source_url: str) -> sqlite3.Row | None:
    if article_id:
        row = conn.execute("SELECT * FROM articles WHERE article_id=?", (article_id,)).fetchone()
        if row:
            return row
    if source_url:
        return conn.execute("SELECT * FROM articles WHERE source_url=?", (source_url,)).fetchone()
    return None


def import_sdg(root: Path, input_path: Path, dry_run: bool) -> None:
    if not input_path.exists():
        raise RuntimeError(f"CSV not found: {input_path}")
    conn = connect(root)
    ensure_schema(conn)
    stats = {"rows": 0, "updated": 0, "unchanged": 0, "not_found": 0, "invalid": 0}
    errors: list[dict[str, Any]] = []

    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for line_no, record in enumerate(reader, start=2):
            stats["rows"] += 1
            try:
                article_id = str(record.get("article_id") or "").strip()
                source_url = str(record.get("source_url") or "").strip()
                article = find_article(conn, article_id, source_url)
                if not article:
                    stats["not_found"] += 1
                    errors.append({"line": line_no, "article_id": article_id, "error": "article not found"})
                    continue

                status = str(record.get("sdg_review_status") or "unreviewed").strip().lower()
                if status not in REVIEW_STATUSES:
                    raise ValueError(f"Invalid sdg_review_status: {status}")
                label_source = str(record.get("sdg_label_source") or "import").strip().lower()
                if label_source not in LABEL_SOURCES:
                    raise ValueError(f"Invalid sdg_label_source: {label_source}")
                goals, targets = validate_sdg(record.get("sdg_goals"), record.get("sdg_targets"))
                if status == "reviewed" and not goals and str(record.get("sdg_notes") or "").strip() == "":
                    # Reviewed-without-label is allowed, but a note makes that decision auditable.
                    note = "Reviewed: no applicable SDG label selected."
                else:
                    note = str(record.get("sdg_notes") or "").strip() or None
                reviewer = str(record.get("sdg_reviewed_by") or "").strip() or None
                reviewed_at = now_iso() if status in {"reviewed", "not_applicable"} else None
                stamp = now_iso()

                current = (
                    json_list(article["sdg_goals_json"]), json_list(article["sdg_targets_json"]),
                    article["sdg_review_status"], article["sdg_label_source"], article["sdg_reviewed_by"], article["sdg_notes"],
                )
                proposed = (goals, targets, status, label_source, reviewer, note)
                if current == proposed:
                    stats["unchanged"] += 1
                    continue

                if not dry_run:
                    conn.execute(
                        """
                        UPDATE articles
                        SET sdg_goals_json=?, sdg_targets_json=?, sdg_review_status=?, sdg_label_source=?,
                            sdg_notes=?, sdg_reviewed_at=?, sdg_reviewed_by=?, metadata_version=?, metadata_updated_at=?
                        WHERE article_id=?
                        """,
                        (
                            json.dumps(goals, ensure_ascii=False), json.dumps(targets, ensure_ascii=False), status,
                            label_source, note, reviewed_at, reviewer, METADATA_VERSION, stamp, article["article_id"],
                        ),
                    )
                stats["updated"] += 1
            except Exception as exc:
                stats["invalid"] += 1
                errors.append({"line": line_no, "article_id": str(record.get("article_id") or ""), "error": str(exc)})

    if not dry_run:
        conn.commit()
    conn.close()
    print(json.dumps({
        "ok": stats["invalid"] == 0 and stats["not_found"] == 0,
        "dryRun": dry_run,
        "stats": stats,
        "errors": errors[:50],
        "note": "Only reviewed labels should be used by the future SDG metadata router.",
    }, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="SURF Data Layer v1.0 article metadata tools")
    parser.add_argument("command", choices=["migrate", "audit", "export", "sdg-template", "sdg-import"])
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--output")
    parser.add_argument("--input")
    parser.add_argument("--all", action="store_true", help="For sdg-template, include already reviewed rows")
    parser.add_argument("--dry-run", action="store_true", help="Validate an SDG CSV without writing changes")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    if args.command == "migrate":
        migrate(root)
    elif args.command == "audit":
        audit(root)
    elif args.command == "export":
        output = Path(args.output or (root / "state" / "article-metadata.jsonl"))
        export_jsonl(root, output)
    elif args.command == "sdg-template":
        output = Path(args.output or (root / "state" / "sdg-tagging-template.csv"))
        export_sdg_template(root, output, only_unreviewed=not args.all)
    elif args.command == "sdg-import":
        if not args.input:
            raise SystemExit("--input is required for sdg-import")
        import_sdg(root, Path(args.input).expanduser().resolve(), args.dry_run)


if __name__ == "__main__":
    main()
