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
