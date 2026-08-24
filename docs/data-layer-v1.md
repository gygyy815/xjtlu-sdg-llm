# SURF Data Layer v1.0

This stage starts after the RAG Core is frozen.

## Goal

Keep article facts and labels in a structured registry before they are used by retrieval. The registry lives in:

`$XJTLU_CONTENT_ROOT/state/articles.db`

Default root:

`/mnt/sdd/xjtlu-content`

The data layer does **not** infer SDG labels. SDG labels become authoritative only after review.

## Metadata fields

Existing core fields are retained:

- `article_id`
- `account`
- `title`
- `source_url`
- `published_at`
- `content_hash`
- `status`
- AnythingLLM sync identifiers

Data Layer v1 adds:

- `metadata_version`
- `language`
- `content_type`
- `audience_json`
- `validity_status`
- `sdg_goals_json`
- `sdg_targets_json`
- `sdg_review_status`
- `sdg_label_source`
- `sdg_notes`
- `sdg_reviewed_at`
- `sdg_reviewed_by`
- `metadata_updated_at`

## SDG review states

- `unreviewed`: no authoritative classification yet
- `needs_review`: classification exists but still needs review
- `reviewed`: authoritative result; future SDG-aware retrieval may use it
- `not_applicable`: reviewed and intentionally has no SDG label

Only `reviewed` labels should be used for future SDG metadata filtering.

## Commands

After pulling the latest code:

```bash
npm run metadata:migrate
npm run metadata:audit
```

Export the complete registry:

```bash
npm run metadata:export
```

Default output:

`$XJTLU_CONTENT_ROOT/state/article-metadata.jsonl`

Create an SDG tagging CSV without changing any labels:

```bash
npm run metadata:sdg:template
```

Default output:

`$XJTLU_CONTENT_ROOT/state/sdg-tagging-template.csv`

The template can later be filled manually or by a dedicated classification workflow. Keep 0-3 SDG goals per article and prefer specific targets when evidence supports them.

Before importing a completed CSV, validate it:

```bash
npm run metadata:sdg:check -- --input /path/to/completed-sdg.csv
```

If validation is clean:

```bash
npm run metadata:sdg:import -- --input /path/to/completed-sdg.csv
```

The importer accepts goals such as `SDG 4` and targets such as `4.7`. Multiple values can be separated with semicolons. Target prefixes automatically add the corresponding goal to keep the structured labels internally consistent.

## Recommended workflow

```text
incoming articles
  ↓
sync-server-articles.py
  ↓
articles.db + processed Markdown
  ↓
article-metadata.py migrate/audit
  ↓
SDG tagging template
  ↓
manual / dedicated classifier
  ↓
review
  ↓
article-metadata.py sdg-import
  ↓
reviewed structured labels
  ↓
future SDG-aware retrieval
```

OCR is intentionally outside this stage for now. Missing image text can be added later without changing the metadata schema.
