# XJTLU Campus Knowledge Assistant

SURF-2026-0395 demo built with Next.js and AnythingLLM.

## Current scope

This version contains both the user-facing Campus AI Assistant and a server-side article pipeline. The demo no longer depends on Obsidian.

```text
公众号文章 / existing exports
        ↓
Server incoming
        ↓
Phase 1: source identification + SHA-256 dedupe + SQLite + processed Markdown
        ↓
Phase 2: approved source → AnythingLLM Workspace incremental sync
        ↓
AnythingLLM RAG
        ↓
Next.js Demo
        ↓
Chat · Knowledge Graph · File Fill · Article Summary · Activity Extraction · Validity Check
```

SDG tagging is intentionally excluded from the current iteration.

## Demo features

- AnythingLLM Workspace selection, limited to the approved mappings in `.env.local`
- RAG chat with source cards and original links when available
- AnythingLLM-backed conversation history
- Skill Center with collapsible panel
  - Knowledge Graph
  - File Fill
  - Article Summary
  - Activity Information Extraction
  - Information Validity Check
  - Chinese / English response
  - local custom/imported skills
- Cytoscape.js interactive knowledge graph with zoom, reset, fit, fullscreen and source evidence
- Staged `.xlsx` / `.docx` filling:
  1. upload template
  2. inspect detected fields
  3. confirm selected fields
  4. retrieve from the selected knowledge base
  5. generate and preview the result
  6. download the filled file
- Knowledge-base management page, dashboard and prototype feedback/Section E survey

## Configure

1. Copy `.env.example` to `.env.local`.
2. Set `ANYTHINGLLM_BASE_URL`.
3. Set an AnythingLLM Developer API key in `ANYTHINGLLM_API_KEY`.
4. Set `ANYTHINGLLM_WORKSPACES` to the **approved** source-account → Workspace slug mapping.
5. Optionally set `ANYTHINGLLM_ALL_WORKSPACE_SLUG` for a cross-source total knowledge base.
6. Set `XJTLU_CONTENT_ROOT` on the server.

Example:

```env
ANYTHINGLLM_BASE_URL=http://127.0.0.1:3001
ANYTHINGLLM_API_KEY=...
ANYTHINGLLM_WORKSPACES={"西交利物浦大学":"xjtlu-official","西交利物浦大学图书馆":"xjtlu-sdg","西浦学生服务":"xjtlu-student-affairs"}
ANYTHINGLLM_ALL_WORKSPACE_SLUG=xjtlu-all-sources
XJTLU_CONTENT_ROOT=/mnt/sdd/xjtlu-content
```

Never expose the AnythingLLM API key through a variable prefixed with `NEXT_PUBLIC_`.

## Phase 1 — server article repository

Initialize and scan:

```bash
npm run sync:server:init
npm run sync:server
npm run sync:server:status
```

The repository uses:

```text
/mnt/sdd/xjtlu-content/
├── incoming/
├── raw/
├── processed/
├── assets/
├── state/articles.db
├── logs/
└── failed/
```

<<<<<<< HEAD
### How source accounts are distinguished

The scanner does **not** require one physical folder per公众号. It resolves the source in this order:

1. explicit article metadata (`source_account`, `account`, `wechat_account`, `publisher`, or `source_name`)
2. the first folder under `incoming/`
3. otherwise `未分类`

For a flat mixed folder, add an explicit source field to every article. Example Markdown:

```markdown
---
source_account: 西交利物浦大学图书馆
published_at: 2026-08-18
source_url: https://mp.weixin.qq.com/...
---
# Article title
...
```

Example JSON:

```json
{
  "source_account": "西交利物浦大学图书馆",
  "title": "Article title",
  "source_url": "https://mp.weixin.qq.com/...",
  "published_at": "2026-08-18",
  "content": "..."
}
```

If neither metadata nor folder name identifies the source, the article stays `未分类` and Phase 2 will not upload it.

## Phase 2 — server → AnythingLLM

Phase 2 never auto-creates Workspaces. This is intentional, because accidental auto-creation previously produced many unwanted Workspaces.

Use:

```bash
npm run sync:anythingllm:discover
npm run sync:anythingllm:dry-run
npm run sync:anythingllm
npm run sync:anythingllm:retry
npm run sync:anythingllm:status
```

Workflow:

```text
processed article
      ↓
read source_account
      ↓
find approved ANYTHINGLLM_WORKSPACES mapping
      ↓
verify Workspace exists in AnythingLLM
      ↓
POST /api/v1/document/raw-text
      ↓
source Workspace (+ optional all-sources Workspace)
      ↓
status = synced
```

Unknown/new source accounts are set to `pending_workspace`. To approve a new公众号:

1. Confirm its source name.
2. Create or confirm its Workspace in AnythingLLM manually.
3. Add `"公众号名":"workspace-slug"` to `ANYTHINGLLM_WORKSPACES`.
4. Run `npm run sync:anythingllm:discover`.
5. Run the dry-run.
6. Run the real sync.

If `ANYTHINGLLM_ALL_WORKSPACE_SLUG` is configured and exists, each article is uploaded once and embedded into both its source-specific Workspace and the all-sources Workspace.

Updated articles are uploaded as a new version first; after the new version succeeds, Phase 2 attempts to purge the previous AnythingLLM document. This prevents an update from deleting the only good copy before the replacement is available.

## AnythingLLM integration

The server talks to AnythingLLM only from server-side code. Ordinary questions use Workspace RAG. Knowledge graph retrieval uses Workspace vector search and renders relationships in Cytoscape.js. Phase 2 uses AnythingLLM's raw-text document API with `addToWorkspaces`, preserving title, source account, source URL and publication metadata.
=======
## Knowledge organisation enrichment (M6-A)

Source Account, Organization Unit, Knowledge Domain, and AnythingLLM Workspace
are separate concepts. A Source Account identifies who published an article;
an Organization Unit is the exact normalized organization derived from that
account; a Knowledge Domain is the Article Center's semantic retrieval
category; and an AnythingLLM Workspace is the homepage assistant's actual RAG
scope. M6-A does not map domains or organizations to workspaces or change
`workspaceMap()`.

Classification is an independent, optional enrichment layer. Each auditable
source record is stored at `classification/<articleId>.json` below
`KB_ENRICHMENT_ROOT`:

```json
{
  "version": 1,
  "articleId": "929fcc9d7def3801",
  "primaryDomain": "schools-research",
  "secondaryDomains": ["careers-opportunities"],
  "contentType": "opportunity",
  "classifiedAt": "2026-08-17T00:00:00.000Z",
  "classification": {
    "method": "rule",
    "version": "taxonomy-v1"
  }
}
```

`primaryDomain` and `contentType` may be absent when unresolved.
`secondaryDomains` is always an array, defaults to empty, and may contain at
most one domain in V1. Completely empty classification records are invalid;
uncertain content remains unclassified instead of being forced into `other`.
Organization Unit is deliberately not stored in classification JSON. It is
derived from `article.account` through exact approved account mappings.

Approved Knowledge Domain V1 registry:

| Key | 中文 | English |
| --- | --- | --- |
| `careers-opportunities` | 就业与机会 | Careers & Opportunities |
| `admissions-study` | 招生与学业 | Admissions & Study |
| `student-services-campus-life` | 学生服务与校园生活 | Student Services & Campus Life |
| `library-academic-support` | 图书馆与学术支持 | Library & Academic Support |
| `university-affairs` | 学校综合事务 | University-wide Information |
| `schools-research` | 学院与科研动态 | Schools & Research |
| `alumni-community` | 校友与社区 | Alumni & Community |

`university-affairs` is an information domain, not a provenance or trusted-
source flag. Approved primary Content Type V1 keys are `activity`, `notice`,
`guide`, `opportunity`, `news`, and `other`. Definitions and bilingual labels
live in the authoritative registries under `lib/classification/`; arbitrary
strings found in enrichment JSON never become UI filter options.

The Organization Unit registry contains only approved high-confidence exact
mappings for Career Centre, Admissions, Alumni Association, University,
Library, Student Services, Graduate School, IBSS, Design, HSS, Film and
Creative Technologies, Future Education, Science, Wisdom Lake Pharmacy,
Intelligent Engineering, Mathematics and Physics, AI and Advanced Computing,
and AI Academy. Unknown account strings remain unmapped and are reported; no
fuzzy or guessed organization mapping is used.

The deterministic V2 classifier reads metadata only (`title`, `digest`, and
`account`). Organization context supplies high-confidence primary domains.
Strong explicit recruitment/admissions evidence may add at most one secondary
domain. Content type is selected from scored title/digest evidence covering
opportunity, event, future, completed, procedural, administrative, and
editorial signals. Domain/account priors are weak, are only applied after
content evidence exists, and cannot assign a type by themselves. Close
competing scores remain ambiguous. The competition boundary distinguishes
applications/recruitment (`opportunity`), scheduled participation (`activity`),
and retrospective achievements (`news`). The engine never uses `other` merely
because no evidence reached the threshold.

Run a safe real-index dry run with:

```bash
npm run classify:articles -- --dry-run --index /path/to/full-kb-index.json
```

Pass `--baseline-report /path/to/earlier-report.json` to embed a deterministic
before/after content-type comparison. Each run also reports unresolved counts
by account, primary domain, and digest availability, and writes a separate
100-record stratified unresolved sample alongside the 250-record QA sample.

There is intentionally no production-write flag. The command does not read
article bodies, call an LLM, write per-article classification records, or
replace `classification/index.json`. It writes only a coverage report and a
deterministic stratified human-review CSV/JSON sample below
`reports/classification/` unless `--report-dir` is supplied.

Build the compact runtime lookup only from records that already exist:

```bash
npm run index:classification
```

This writes `classification/index.json` atomically and a deterministic build
report to `reports/classification/index-build.json`. Unknown domain/type values
and malformed records are reported and skipped without poisoning valid
records. Missing classification data is supported: unclassified articles stay
visible without a domain/type filter and are excluded from specific filters.
Organization filtering remains available independently because it is derived
from Source Account metadata even when semantic classification is absent.

`classification/index.json` is cached once per server module instance. The V1
production refresh procedure is: run the classification batch, rebuild the
classification index, then restart `xjtlu-sdg-prod`. File watching and hot
reload are intentionally out of scope.

Future, separate enrichment layers may add provenance/authority values such as
`official`, `primary`, `repost`, and `unknown`, plus canonicalisation/duplicate
detection fields such as `canonicalArticleId` and `duplicateCluster`. These do
not belong in the M6-A classification schema and are not implemented.
>>>>>>> 27ed509 (feat: add M6 knowledge organisation and article filters)

## File templates

### Excel

The upload is inspected first. Candidate fields are detected from blank cells whose immediately-left cell contains a field label. The user confirms which fields should be filled before the knowledge-base request runs.

### Word

Use placeholders such as:

```text
{{活动名称}}
{{活动时间}}
{{活动地点}}
{{原文链接}}
```

Generated fields require human review.

## Deployment

Recommended deployment:

```text
Browser
  ↓
Next.js on Huawei ECS
  ↓ server-side API
AnythingLLM
  ↓
/mnt/sdd/xjtlu-content + SQLite
```

For the server pipeline, keep `.env.local` and `articles.db` out of Git. Back up the AnythingLLM storage directory and the server article repository before large historical imports.
