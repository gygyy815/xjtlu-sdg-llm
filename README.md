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

## File templates

- Excel: a blank cell is filled when the cell immediately to its left contains a field label.
- Word: add placeholders such as `{{活动名称}}`, `{{活动时间}}`, and `{{原文链接}}`. The current version replaces placeholders in the document XML and returns `filled-<original-name>.docx`.
- Maximum upload size: 10 MB. Generated fields require human review.

## AnythingLLM endpoint

The server calls `POST /api/v1/workspace/:slug/chat` with the developer API key. Keys stay on the server, and the demo uses `query` mode for stable workspace RAG.

The current AnythingLLM Developer API does not expose the native Agent tool loop used by the built-in AnythingLLM chat interface. The demo therefore does not display an Agent toggle or prepend `@agent` to API requests. Native Agent tasks remain available in the AnythingLLM interface; prompt-based skills in this demo cover structured retrieval, summarisation, validity checks, SDG analysis, and bilingual output without pretending to invoke Agent tools.
