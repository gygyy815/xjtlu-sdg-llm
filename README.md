# XJTLU Campus Knowledge Assistant

Lightweight SURF-2026-0395 demo connected to AnythingLLM. The UI intentionally focuses on one knowledge task instead of reproducing the former multi-page portal.

## Included

- Knowledge-base selection by WeChat official account
- Stable workspace RAG through the documented Developer API
- Prompt shortcuts and source cards
- Chinese/English response language controlled by the AnythingLLM workspace prompt
- `.xlsx` and `.docx` template filling with a downloadable returned file

## Configure

1. Copy `.env.example` to `.env.local`.
2. Set `ANYTHINGLLM_BASE_URL` and an AnythingLLM developer API key.
3. Set `ANYTHINGLLM_WORKSPACES` to a JSON mapping of visible account names to workspace slugs.
4. Run `npm install` and `npm run dev`.

Never expose the API key through a variable prefixed with `NEXT_PUBLIC_`.

## Knowledge content and synchronization

The 30 supplied WeChat articles are normalized in `content/` with YAML frontmatter. Both `npm run dev` and `npm run build` regenerate `data/articles.generated.json`, so the article centre never depends on a manually copied JSON file.

- `/articles`: generated article centre, filters and detail pages.
- `/admin/sync`: previews additions and changes, then uploads changed Markdown files and updates the matching AnythingLLM Workspace embeddings.
- Deleted local files are reported as pending deletion and are never removed automatically.

Before using `/admin/sync`, add all three knowledge-base names and their real Workspace slugs to `ANYTHINGLLM_WORKSPACES`, and set a long random `ADMIN_SYNC_TOKEN`. The API fails closed and remains disabled when this token is missing.

To import another extracted legacy ZIP:

```bash
npm run import:kb -- /path/to/SURF_Dify_小规模测试库
npm run index:kb
```

## Translation enrichment (M4-A)

M4-A pre-generates translation records outside the read-only source Markdown. Set `KB_MARKDOWN_ROOT`, `KB_INDEX_PATH`, and a writable `KB_ENRICHMENT_ROOT`, then run:

```bash
npm run translate:articles -- --since 2026-07-01 --limit 20
```

Articles are selected newest-first from the full index. Existing English records are skipped; add `--force` to replace them. The current `MockTranslationProvider` makes no network calls and intentionally copies source text unchanged so selection, storage, Markdown/URL fidelity, caching, and reports can be validated before a paid provider is added.

Outputs are stored below `KB_ENRICHMENT_ROOT`:

```text
translations/en/<articleId>.json
reports/translations/<runId>.json
```

## File templates

- Excel: a blank cell is filled when the cell immediately to its left contains a field label.
- Word: add placeholders such as `{{活动名称}}`, `{{活动时间}}`, and `{{原文链接}}`. The current version replaces placeholders in the document XML and returns `filled-<original-name>.docx`.
- Maximum upload size: 10 MB. Generated fields require human review.

## AnythingLLM endpoint

The server calls `POST /api/v1/workspace/:slug/chat` with the developer API key. Keys stay on the server, and the demo uses `query` mode for stable workspace RAG.

The current AnythingLLM Developer API does not expose the native Agent tool loop used by the built-in AnythingLLM chat interface. Native Agent tasks remain available in AnythingLLM itself; the demo does not display an Agent toggle or pretend ordinary workspace chat invokes Agent tools.
