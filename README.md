# XJTLU Campus Knowledge Assistant

SURF-2026-0395 demo built with Next.js and AnythingLLM.

## Current scope

This version focuses on the user-facing Campus AI Assistant and intentionally keeps data-ingestion infrastructure out of the demo flow.

**Current runtime path**

```text
AnythingLLM Workspace(s)
        ↓
Workspace RAG / Agent request
        ↓
Next.js Demo
        ↓
Chat · Knowledge Graph · File Fill · Article Summary · Activity Extraction · Validity Check
```

The demo **does not depend on Obsidian** and does not require an Obsidian → script → AnythingLLM synchronization pipeline. Knowledge ingestion can be handled separately; for this demo, documents are expected to already exist in the configured AnythingLLM Workspaces.

## Included

- AnythingLLM Workspace selection
- RAG chat with source cards and original links when available
- Skill Center
  - Knowledge Graph
  - File Fill
  - Article Summary
  - Activity Information Extraction
  - Information Validity Check
  - Chinese / English response
- Agent-mode request path using `@agent` when enabled
- Knowledge-graph JSON extraction plus in-chat relationship visualization
- Staged `.xlsx` / `.docx` filling:
  1. upload template
  2. inspect detected fields
  3. confirm selected fields
  4. retrieve from the selected knowledge base
  5. generate and preview the result
  6. download the filled file
- Per-session counters for chat requests and file processing

SDG tagging is intentionally excluded from the current iteration.

## Configure

1. Copy `.env.example` to `.env.local`.
2. Set `ANYTHINGLLM_BASE_URL`.
3. Set an AnythingLLM Developer API key in `ANYTHINGLLM_API_KEY`.
4. Set `ANYTHINGLLM_WORKSPACES` to a JSON mapping of display names to Workspace slugs.
5. Run:

```bash
npm install
npm run dev
```

Never expose the AnythingLLM API key through a variable prefixed with `NEXT_PUBLIC_`.

## AnythingLLM integration

The server talks to the configured AnythingLLM instance from server-side API routes. Ordinary questions use Workspace RAG. When Agent mode is enabled, the demo prefixes the task with `@agent` before sending it to the selected Workspace so the configured AnythingLLM Agent path can be invoked.

The exact tools available to Agent mode depend on the Agent Skills enabled in the target AnythingLLM instance.

## Knowledge graph

The first version uses a lightweight in-repository SVG renderer. The model returns a structured graph with nodes and edges, then the frontend renders the relationships directly inside the chat.

Current entity types are focused on the project requirements, for example:

- activity
- department / organisation
- audience
- location
- time
- topic

The renderer can later be replaced by Cytoscape.js without changing the AnythingLLM retrieval layer.

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

The detected placeholders are shown before filling. Maximum upload size is 10 MB. Generated fields require human review.

## Article centre

The repository still contains the existing article-centre/index code used by the demo pages. It is independent of the Obsidian workflow and is not the primary ingestion path for this iteration.

## Deployment

The recommended deployment model is:

```text
Browser
  ↓
Next.js deployment
  ↓ server-side API
AnythingLLM instance
```

For a hosted frontend, make sure the deployed server can reach `ANYTHINGLLM_BASE_URL`. If AnythingLLM is only reachable through a private/internal address, deploy the Next.js app on the same network or expose a secure reachable API endpoint.
