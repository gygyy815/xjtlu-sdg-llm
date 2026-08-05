# Chatflow blueprint

Build a Dify **Chatflow** with these nodes:

1. User Input
2. Question Analysis (LLM)
3. Knowledge Retrieval
4. Evidence Check (LLM or conditional branch)
5. Evidence-grounded Answer (LLM)
6. Answer

## Question Analysis output

Return JSON only:

```json
{
  "language": "zh",
  "source_account": null,
  "department": null,
  "audience": null,
  "content_type": null,
  "date_requirement": null,
  "sdg": null
}
```

Do not infer a filter unless the user explicitly states it. A missing filter must remain `null`.

## Retrieval configuration

Connect all three test knowledge bases. Start with Hybrid Search, Top K 5, and reranking when available. Apply a metadata filter only when the corresponding parsed value is not null. Keep shared metadata field names identical across knowledge bases.

## Evidence decision

Treat evidence as insufficient when:

- no relevant segment is returned;
- the segment does not contain the requested date, location, eligibility, registration URL, or other required fact;
- sources conflict and the conflict cannot be resolved;
- the answer would require current information not present in the indexed documents.

When insufficient, answer that no reliable information was found in the current knowledge base and identify what is missing.

## Citation display

Enable Dify Citation and Attribution. The final answer should also name the article, source account, publication date, and original URL when these are present in evidence.

This file is a version-neutral construction blueprint. Export the completed Chatflow DSL from the actual Dify workspace only after the three knowledge-base IDs and model provider are selected; those values are workspace-specific.
