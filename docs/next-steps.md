# Operator checklist

1. Create the three knowledge bases listed in `knowledge-base-setup.md`.
2. Upload the matching 30 local Markdown test documents directly to Dify.
3. Verify indexing and retrieved chunks before building the Chatflow.
4. Build the nodes in `dify/chatflow-blueprint.md`.
5. Paste `prompts/system-prompt.md` into the evidence-grounded answer node.
6. Enable Citation and Attribution.
7. Run every case in `tests/chatflow-acceptance.csv`.
8. Record failures before tuning chunk size, Top K, reranking, or prompts.
9. Export the tested Dify DSL and add it in a later PR.
10. Never commit Dify API keys, model-provider keys, or unreviewed article archives.

## MVP acceptance thresholds

- Correct-document recall: at least 80%
- Source display: 100%
- Fabricated links: 0
- Expired-information warning: at least 90%
- No-evidence refusal: at least 90%
