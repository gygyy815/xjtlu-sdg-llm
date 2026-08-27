import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import pg from "pg";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const dataRoot = process.env.RAG_TEST_DATA_ROOT;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured in .env.local");
}

if (!dataRoot) {
  throw new Error("RAG_TEST_DATA_ROOT is not configured in .env.local");
}

if (!fs.existsSync(dataRoot)) {
  throw new Error(`RAG test directory does not exist: ${dataRoot}`);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function slugify(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function parseArticle(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);

  const title =
    lines
      .find((line) => /^#\s+/.test(line))
      ?.replace(/^#\s+/, "")
      .trim() || path.basename(filePath, path.extname(filePath));

  const dateMatch = raw.match(
    /\b(20\d{2}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/,
  );

  const publishedAt = dateMatch
    ? `${dateMatch[1]}T${dateMatch[2] || "00:00"}:00+08:00`
    : null;

  const sourceLine =
    lines.find((line) => dateMatch && line.includes(dateMatch[1])) || "";

  const sourceName = sourceLine
    .replace(/^原创\s*/, "")
    .replace(dateMatch ? dateMatch[0] : "", "")
    .replace(/\s+(江苏|苏州|上海|北京|中国)\s*$/, "")
    .trim();

  const urlMatch =
    raw.match(
      /原文地址[^\n]*(https?:\/\/mp\.weixin\.qq\.com\/[^\s\])>]+)/i,
    ) ||
    raw.match(/https?:\/\/mp\.weixin\.qq\.com\/s\/[^\s\])>]+/i);

  const sourceUrl = urlMatch?.[1] || urlMatch?.[0] || null;

  const relativePath = path
    .relative(dataRoot, filePath)
    .replaceAll("\\", "/");

  const parentName = path.basename(path.dirname(filePath));
  const sourceId = slugify(parentName) || "unknown-source";

  const articleId = `test-${crypto
    .createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 20)}`;

  const contentHash = crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex");

  const cleaned = raw
    .replace(/^#\s+.*$/m, "")
    .replace(/^>\s*原文地址:.*$/m, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    articleId,
    sourceId,
    sourceName,
    title,
    sourceUrl,
    relativePath,
    contentHash,
    publishedAt,
    content: cleaned,
  };
}

function splitIntoChunks(text, maxChars = 1800, overlapChars = 240) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (current.length + 2 + paragraph.length <= maxChars) {
      current += `\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);

    const overlap = current.slice(-overlapChars);
    current = `${overlap}\n\n${paragraph}`;

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars));
      current = current.slice(maxChars - overlapChars);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function importArticle(article) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO rag_articles
       (
         article_id,
         source_id,
         title,
         source_url,
         relative_path,
         content_hash,
         published_at,
         metadata,
         updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
       ON CONFLICT (article_id) DO UPDATE SET
         source_id = EXCLUDED.source_id,
         title = EXCLUDED.title,
         source_url = EXCLUDED.source_url,
         relative_path = EXCLUDED.relative_path,
         content_hash = EXCLUDED.content_hash,
         published_at = EXCLUDED.published_at,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        article.articleId,
        article.sourceId,
        article.title,
        article.sourceUrl,
        article.relativePath,
        article.contentHash,
        article.publishedAt,
        JSON.stringify({
          sourceName: article.sourceName,
          testDataset: true,
        }),
      ],
    );

    await client.query(
      "DELETE FROM rag_chunks WHERE article_id = $1",
      [article.articleId],
    );

    const chunks = splitIntoChunks(article.content);

    for (let index = 0; index < chunks.length; index += 1) {
      await client.query(
        `INSERT INTO rag_chunks
         (
           article_id,
           chunk_index,
           content,
           token_count,
           metadata
         )
         VALUES ($1,$2,$3,$4,$5::jsonb)`,
        [
          article.articleId,
          index,
          chunks[index],
          Math.ceil(chunks[index].length / 2),
          JSON.stringify({
            title: article.title,
            sourceName: article.sourceName,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    return chunks.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const markdownFiles = walk(dataRoot).filter((filePath) => {
  const name = path.basename(filePath);

  return (
    filePath.toLowerCase().endsWith(".md") &&
    !/readme|说明|清单/i.test(name)
  );
});

const job = await pool.query(
  `INSERT INTO rag_sync_jobs(status, articles_seen)
   VALUES('running', $1)
   RETURNING id`,
  [markdownFiles.length],
);

const jobId = job.rows[0].id;

let articlesAdded = 0;
let chunksAdded = 0;

try {
  for (const filePath of markdownFiles) {
    const article = parseArticle(filePath);
    const chunkCount = await importArticle(article);

    articlesAdded += 1;
    chunksAdded += chunkCount;

    console.log(
      `[${articlesAdded}/${markdownFiles.length}] ` +
        `${article.title} -> ${chunkCount} chunks`,
    );
  }

  await pool.query(
    `UPDATE rag_sync_jobs
     SET
       status = 'completed',
       articles_added = $1,
       chunks_added = $2,
       finished_at = NOW()
     WHERE id = $3`,
    [articlesAdded, chunksAdded, jobId],
  );

  console.log(
    `Import completed: ${articlesAdded} articles, ` +
      `${chunksAdded} chunks.`,
  );
} catch (error) {
  await pool.query(
    `UPDATE rag_sync_jobs
     SET
       status = 'failed',
       articles_added = $1,
       chunks_added = $2,
       error_message = $3,
       finished_at = NOW()
     WHERE id = $4`,
    [articlesAdded, chunksAdded, String(error), jobId],
  );

  throw error;
} finally {
  await pool.end();
}