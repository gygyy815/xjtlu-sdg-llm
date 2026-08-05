# Dify knowledge-base setup

Create these three knowledge bases in Dify:

1. `KB-01_西交利物浦大学`
2. `KB-02_西交利物浦大学图书馆`
3. `KB-03_西浦学生服务`

Upload only the ten Markdown articles assigned to each matching folder in the local 30-article test package. Do not upload the README or CSV files.

## Initial indexing settings

| Setting | Initial value |
|---|---|
| Indexing | High Quality |
| Chunk mode | General |
| Chunk size | 600 tokens |
| Overlap | 80 tokens |
| Retrieval | Hybrid Search |
| Top K | 5 |
| Reranking | Enable when a rerank model is available |

## Shared metadata fields

Keep field names and types identical in all three knowledge bases.

| Field | Type | Required for MVP | Notes |
|---|---|---:|---|
| source_account | string | yes | Publishing WeChat account |
| source_url | string | yes | Original article URL |
| published_date | date/string | yes | Publication date, not event date |
| department | string | no | Responsible department |
| audience | string | no | students, staff, public, etc. |
| content_type | string | no | activity, notice, news, policy |
| primary_sdg_goal | string | no | Suggested classification |
| primary_sdg_target | string | no | Suggested target |
| validity_status | string | yes | active, expired, uncertain |
| review_status | string | yes | pending, approved, rejected |

Do not rename or change the type of existing source metadata in the Markdown files. Dify metadata should supplement the source files, not rewrite them.

## Validation after upload

For every article, confirm:

- title, publication date, body, and original URL are indexed;
- publication date is not confused with event date;
- the retrieved segment contains the evidence needed for an answer;
- citations point to the correct source document;
- expired or uncertain information receives a warning.
