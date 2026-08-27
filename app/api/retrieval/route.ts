import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  var xjtluRagPool: Pool | undefined;
}

const pool =
  global.xjtluRagPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  global.xjtluRagPool = pool;
}

type RetrievalRequest = {
  query?: unknown;
  source_ids?: unknown;
  article_id?: unknown;
  top_k?: unknown;
  min_score?: unknown;
};

async function createEmbedding(text: string): Promise<number[]> {
  const apiBase = process.env.SILICONFLOW_API_BASE;
  const apiKey = process.env.SILICONFLOW_API_KEY;
  const model = process.env.EMBEDDING_MODEL;

  if (!apiBase || !apiKey || !model) {
    throw new Error("Embedding configuration is incomplete");
  }

  const response = await fetch(`${apiBase}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      encoding_format: "float",
    }),
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Embedding API returned ${response.status}`);
  }

  const embedding = result.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== 1024) {
    throw new Error("Embedding response has invalid dimensions");
  }

  return embedding;
}

export async function POST(request: NextRequest) {
  try {
    const configuredKey = process.env.RETRIEVAL_API_KEY;

    if (configuredKey) {
      const authorization = request.headers.get("authorization");

      if (authorization !== `Bearer ${configuredKey}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
    }

    const body = (await request.json()) as RetrievalRequest;

    const query =
      typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 },
      );
    }

    const sourceIds = Array.isArray(body.source_ids)
      ? body.source_ids
          .filter(
            (value): value is string =>
              typeof value === "string",
          )
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

    const articleId =
      typeof body.article_id === "string"
        ? body.article_id.trim()
        : "";

    const requestedTopK = Number(body.top_k ?? 5);
    const topK = Number.isFinite(requestedTopK)
      ? Math.min(Math.max(Math.trunc(requestedTopK), 1), 10)
      : 5;

    const requestedMinScore = Number(body.min_score ?? 0.45);
    const minScore = Number.isFinite(requestedMinScore)
      ? Math.min(Math.max(requestedMinScore, 0), 1)
      : 0.45;

    const embedding = await createEmbedding(query);
    const parameters: unknown[] = [
      JSON.stringify(embedding),
    ];

    const filters: string[] = [
      "chunk.embedding IS NOT NULL",
    ];

    if (sourceIds.length > 0) {
      parameters.push(sourceIds);

      filters.push(
        `article.source_id = ANY($${parameters.length}::text[])`,
      );
    }

    if (articleId) {
      parameters.push(articleId);

      filters.push(
        `article.article_id = $${parameters.length}`,
      );
    }

    parameters.push(topK * 8);
    const candidateLimitParameter = `$${parameters.length}`;

    parameters.push(topK);
    const finalLimitParameter = `$${parameters.length}`;

    const result = await pool.query(
      `WITH candidates AS (
         SELECT
           article.article_id,
           article.title,
           article.source_id,
           article.source_url,
           article.published_at,
           article.metadata->>'sourceName' AS source_name,
           chunk.id AS chunk_id,
           chunk.chunk_index,
           chunk.content,
           chunk.embedding <=> $1::vector AS distance
         FROM rag_chunks AS chunk
         INNER JOIN rag_articles AS article
           ON article.article_id = chunk.article_id
         WHERE ${filters.join(" AND ")}
         ORDER BY chunk.embedding <=> $1::vector
         LIMIT ${candidateLimitParameter}
       ),
       best_per_article AS (
         SELECT DISTINCT ON (article_id)
           article_id,
           title,
           source_id,
           source_url,
           published_at,
           source_name,
           chunk_id,
           chunk_index,
           content,
           distance
         FROM candidates
         ORDER BY article_id, distance
       )
       SELECT
         article_id,
         title,
         source_id,
         source_url,
         published_at,
         source_name,
         chunk_id,
         chunk_index,
         content,
         1 - distance AS score
       FROM best_per_article
       ORDER BY distance
       LIMIT ${finalLimitParameter}`,
      parameters,
    );

    const results = result.rows
      .map((row) => ({
        article_id: row.article_id,
        title: row.title,
        source_id: row.source_id,
        source_name: row.source_name,
        source_url: row.source_url,
        published_at: row.published_at,
        chunk_id: row.chunk_id,
        chunk_index: row.chunk_index,
        content: row.content,
        score: Number(row.score),
        article_path: `/articles/${row.article_id}`,
      }))
      .filter((row) => row.score >= minScore);

    return NextResponse.json({
      query,
      source_ids: sourceIds,
      article_id: articleId || null,
      top_k: topK,
      min_score: minScore,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Retrieval API error:", error);

    return NextResponse.json(
      { error: "Retrieval failed" },
      { status: 500 },
    );
  }
}