# SURF / XJTLU Campus Information Assistant — V1 Demo Acceptance

This checklist freezes the current demo scope before merging `feat/skill-center-graph` into `main`.

## Acceptance status legend

- ✅ PASS — verified by code/CI or current user test
- 🟡 MANUAL QA — feature is implemented, but final runtime/user acceptance is still required
- ⚙️ CONFIG — external configuration is required before production-style use
- ⏸ OUT OF SCOPE — intentionally deferred from V1

## 1. Build and repository

- ✅ GitHub Actions Build Check passes on the current feature branch.
- ✅ `npm run build` passes locally with Next.js production build, type checking, page-data collection and static-page generation.
- 🟡 PR #5 remains Draft until the manual acceptance cases below are completed.
- ⏸ Do not merge into `main` until all P0/P1 acceptance items pass.

## 2. Core knowledge-base chat

### Test A — normal grounded answer

Prompt: `请根据当前知识库介绍一个校园活动，并给出来源。`

Expected:
- answer is grounded in the selected AnythingLLM Workspace;
- no unsupported details are invented;
- source title / date / original link are shown when available;
- missing facts are explicitly marked as not stated.

Status: 🟡 MANUAL QA

### Test B — time-sensitive / upcoming-event guard

Prompt: `给我推荐一个现在可以参加的活动。`

Expected:
- expired events are not presented as currently joinable;
- expired registration deadlines are not presented as open;
- publication date is not treated as event date;
- uncertain/missing year or deadline is not silently guessed;
- if no valid opportunity can be confirmed, the assistant says so.

Status: ✅ PASS — user runtime acceptance completed on 2026-08-19.

## 3. Knowledge Graph

Prompt: `生成近期校园活动与相关部门的知识图谱。`

Expected:
- graph contains only entities supported by retrieved evidence;
- node types such as article / activity / department / audience / place / time are distinguishable;
- fit/reset/layout controls work;
- node focus/highlight works;
- source evidence is available;
- PNG export works.

Status: 🟡 MANUAL QA

## 4. Mind Map

Prompt: `近期校园活动`

Expected:
- Markmap renders a meaningful hierarchy, not just 3–4 shallow nodes unless evidence is genuinely sparse;
- zoom / pan / expand-collapse / fit view work;
- SVG export works;
- Markdown export works;
- a `来源证据 / Source evidence` branch is present with S1/S2/... items derived from actual retrieval results.

Status: ✅ PASS — user runtime acceptance completed on 2026-08-19.

## 5. PPT Builder

Prompt: `近期校园活动`

Recommended test total slides: `4`

Expected:
- generated PPTX has exactly the requested total number of slides;
- cover and source page count toward the requested total;
- broad topics are not collapsed into one unrelated/expired activity when multiple valid items exist;
- time-sensitive prompts apply event/deadline validity checks;
- content is editable in PowerPoint/WPS;
- source page is included;
- no empty content slide is generated.

Status: ✅ PASS — user runtime acceptance completed on 2026-08-19.

## 6. File Fill

Test one `.xlsx` and one `.docx` template.

Expected flow:

`Upload → inspect fields → confirm selected fields → fill from KB → preview/review → download`

Expected:
- custom file picker works in both languages;
- detected fields can be selected/deselected;
- default fill instruction follows current UI language;
- user-edited instruction is not overwritten when language switches;
- unsupported fields are filled with the configured “not explicitly stated” wording rather than guesses;
- generated file downloads successfully;
- dates, numbers, email addresses, places and original links remain subject to human review.

Status: ✅ PASS for bilingual file-fill UI; 🟡 MANUAL QA for final XLSX/DOCX content quality.

## 7. Skill Center

Expected:
- built-in skills are listed and searchable;
- skill list scrolls independently of the page;
- collapse/expand works;
- create/import UI opens correctly;
- EN mode shows English tabs, names, descriptions and scroll hint;
- Chinese mode restores Chinese labels;
- English search terms can find the corresponding built-in skill.

Status: ✅ PASS for the recently verified bilingual/scroll UI; 🟡 MANUAL QA for create/import end-to-end persistence.

## 8. Bilingual UI

Routes to inspect in both `中文` and `EN`:

- `/`
- `/history`
- `/articles`
- `/knowledge-base`
- `/dashboard`
- `/feedback`
- `/settings`
- `/tools/mind-map`
- `/tools/ppt`

Expected:
- navigation, headings, buttons, tabs, placeholders, tooltips and modal controls switch language;
- dynamic UI state messages switch language;
- user prompts, LLM answers, article titles, quotations and source-document content are NOT automatically rewritten merely because the UI language changes;
- the language selector itself remains `中文 / EN` intentionally.

Status: ✅ PASS for home/Skill Center/File Fill fixes already verified; 🟡 MANUAL QA for full route-by-route sweep.

## 9. Private conversation history

Expected:
- `/history` only queries session IDs recorded by the current browser;
- it does not enumerate all global AnythingLLM Workspace history;
- a second browser/device does not automatically see the first browser’s history;
- browser-local history limitation is clearly explained.

Status: 🟡 MANUAL QA

Note: account-level cross-device history is not part of V1; Supabase Auth or institutional SSO would be a later phase.

## 10. Feedback and dashboard

Expected before Supabase configuration:
- feedback falls back to browser `localStorage`;
- dashboard labels the feedback source honestly;
- no fake token usage is shown.

Expected after Supabase configuration:
- quick feedback and Section E survey responses are written to Supabase;
- dashboard can display aggregate feedback / satisfaction data.

Status: ✅ PASS for local fallback behavior; ⚙️ CONFIG for multi-user Supabase collection.

## 11. Settings / system status

Expected:
- AnythingLLM connection state is visible;
- Workspace availability is visible;
- Supabase feedback state is visible;
- paused server/article sync is not presented as required for current Demo runtime.

Status: 🟡 MANUAL QA

## 12. Explicitly deferred from V1

- ⏸ automated WeChat article synchronization pipeline;
- ⏸ Supabase Auth / institutional login;
- ⏸ cross-device personal history;
- ⏸ SDG tagging;
- ⏸ production token-usage accounting;
- ⏸ full skill marketplace;
- ⏸ domain/ICP deployment changes.

## Release gate

The branch can move from Draft → Ready / merge to `main` when:

1. GitHub Build Check is green;
2. local `npm run build` is green;
3. all P0/P1 manual cases above are marked PASS;
4. no known issue can expose another test user’s conversation history;
5. no time-sensitive recommendation knowingly presents an expired event as joinable;
6. PPT/Mind Map/File Fill outputs open/download correctly;
7. the bilingual route sweep has no obvious mixed-language controls in EN mode.

After merge, create a stable release/tag such as `v1.0-demo`, then configure Supabase Feedback and deploy the frozen build to the server for real-user testing.
