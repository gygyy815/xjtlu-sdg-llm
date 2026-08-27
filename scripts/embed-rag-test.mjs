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
const expectedDimensions = Number(
  process.env.EMBEDDING_DIMENSIONS || "1024",
);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

if (!apiBase) {
  throw new Error("SILICONFLOW_API_BASE is not configured");
}

if (!apiKey) {
  throw new Error("SILICONFLOW_API_KEY is not configured");
}

if (!embeddingModel) {
  throw new Error("EMBEDDING_MODEL is not configured");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

const batchSize = 8;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function requestEmbeddings(input, attempt = 1) {
  const response = await fetch(`${apiBase}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input,
      encoding_format: "float",
    }),
  });

  if (response.status === 429 && attempt < 4) {
    const delay = attempt * 3000;

    console.log(
      `Rate limited. Retrying in ${delay / 1000} seconds...`,
    );

    await wait(delay);
    return requestEmbeddings(input, attempt + 1);
  }

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Embedding API ${response.status}: ${JSON.stringify(result)}`,
    );
  }

  const ordered = [...result.data].sort(
    (left, right) => left.index - right.index,
  );

  const embeddings = ordered.map((item) => item.embedding);

  for (const embedding of embeddings) {
    if (
      !Array.isArray(embedding) ||
      embedding.length !== expectedDimensions
    ) {
      throw new Error(
        `Unexpected embedding dimensions: ${
          embedding?.length ?? "missing"
        }`,
      );
    }
  }

  return {
    embeddings,
    usage: result.usage,
  };
}

async function saveBatch(rows, embeddings) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let index = 0; index < rows.length; index += 1) {
      const vector = JSON.stringify(embeddings[index]);

      const embeddingMetadata = JSON.stringify({
        embeddingModel,
        embeddedAt: new Date().toISOString(),
      });

      await client.query(
        `UPDATE rag_chunks
         SET
           embedding = $1::vector,
           metadata = metadata || $2::jsonb
         WHERE id = $3`,
        [
          vector,
          embeddingMetadata,
          rows[index].id,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const result = await pool.query(
  `SELECT
     id,
     article_id,
     chunk_index,
     content
   FROM rag_chunks
   WHERE embedding IS NULL
   ORDER BY id`,
);

const rows = result.rows;

if (rows.length === 0) {
  console.log("No chunks require embedding.");
  await pool.end();
  process.exit(0);
}

console.log(
  `Embedding ${rows.length} chunks with ${embeddingModel}...`,
);

let processed = 0;

try {
  for (
    let offset = 0;
    offset < rows.length;
    offset += batchSize
  ) {
    const batch = rows.slice(offset, offset + batchSize);
    const input = batch.map((row) => row.content);

    const { embeddings, usage } =
      await requestEmbeddings(input);

    await saveBatch(batch, embeddings);

    processed += batch.length;

    console.log(
      `[${processed}/${rows.length}] saved`,
      usage ? `usage=${JSON.stringify(usage)}` : "",
    );

    if (processed < rows.length) {
      await wait(500);
    }
  }

  console.log(
    `Embedding completed: ${processed} chunks, ` +
      `${expectedDimensions} dimensions.`,
  );
} finally {
  await pool.end();
}