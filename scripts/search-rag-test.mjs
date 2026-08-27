import process from "node:process";
import pg from "pg";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
const apiBase = process.env.SILICONFLOW_API_BASE;
const apiKey = process.env.SILICONFLOW_API_KEY;
const embeddingModel = process.env.EMBEDDING_MODEL;

const query = process.argv[2];
const topK = Number(process.argv[3] || "5");
const sourceArgument = process.argv[4] || "";

if (!query) {
  console.error(
    'Usage: node scripts/search-rag-test.mjs "问题" 5',
  );
  process.exit(1);
}

if (!databaseUrl || !apiBase || !apiKey || !embeddingModel) {
  throw new Error("Required environment variables are missing");
}

if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
  throw new Error("Top K must be an integer between 1 and 20");
}

const sourceIds = sourceArgument
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function createQueryEmbedding(text) {
  const response = await fetch(`${apiBase}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: text,
      encoding_format: "float",
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Embedding API ${response.status}: ${JSON.stringify(result)}`,
    );
  }

  const embedding = result.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== 1024) {
    throw new Error(
      `Unexpected embedding dimensions: ${embedding?.length}`,
    );
  }

  return embedding;
}

const pool = new Pool({
  connectionString: databaseUrl,
});

try {
  const queryEmbedding = await createQueryEmbedding(query);
  const vector = JSON.stringify(queryEmbedding);

  const parameters = [vector];
  let sourceFilter = "";

  if (sourceIds.length > 0) {
    parameters.push(sourceIds);
    sourceFilter = `
      AND article.source_id = ANY($2::text[])
    `;
  }

  parameters.push(topK);
  const topKParameter = `$${parameters.length}`;

  const result = await pool.query(
    `WITH candidates AS (
       SELECT
         article.article_id,
         article.title,
         article.source_id,
         article.source_url,
         article.published_at,
         article.metadata->>'sourceName' AS source_name,
         chunk.chunk_index,
         LEFT(chunk.content, 350) AS excerpt,
         chunk.embedding <=> $1::vector AS distance
       FROM rag_chunks AS chunk
       INNER JOIN rag_articles AS article
         ON article.article_id = chunk.article_id
       WHERE chunk.embedding IS NOT NULL
         ${sourceFilter}
       ORDER BY chunk.embedding <=> $1::vector
       LIMIT (${topKParameter} * 5)
     ),
     best_per_article AS (
       SELECT DISTINCT ON (article_id)
         article_id,
         title,
         source_id,
         source_url,
         published_at,
         source_name,
         chunk_index,
         excerpt,
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
       chunk_index,
       excerpt,
       1 - distance AS score
     FROM best_per_article
     ORDER BY distance
     LIMIT ${topKParameter}`,
    parameters,
  );

  console.log(`\n问题：${query}`);
  console.log(
    `知识范围：${
      sourceIds.length > 0 ? sourceIds.join(", ") : "全部"
    }`,
  );
  console.log(`返回数量：${result.rows.length}\n`);

  result.rows.forEach((row, index) => {
    console.log(
      `${index + 1}. ${row.title}`,
    );

    console.log(
      `   相似度：${Number(row.score).toFixed(4)}`,
    );

    console.log(
      `   公众号：${row.source_name || row.source_id}`,
    );

    console.log(
      `   发布日期：${
        row.published_at
          ? new Date(row.published_at).toISOString()
          : "未提供"
      }`,
    );

    console.log(
      `   article_id：${row.article_id}`,
    );

    console.log(
      `   原文：${row.source_url || "未提供"}`,
    );

    console.log(
      `   分段：${row.chunk_index}`,
    );

    console.log(
      `   摘要：${row.excerpt.replace(/\s+/g, " ").trim()}`,
    );

    console.log("");
  });
} finally {
  await pool.end();
}