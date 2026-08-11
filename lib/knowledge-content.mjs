import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export const workspaceFolders = {
  "KB-01_西交利物浦大学": "西交利物浦大学",
  "KB-02_西交利物浦大学图书馆": "西交利物浦大学图书馆",
  "KB-03_西浦学生服务": "西浦学生服务",
};

export function walkMarkdown(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walkMarkdown(target) : (/\.md$/i.test(entry.name) ? [target] : []);
  });
}

export function parseFrontmatter(raw, filename = "document.md") {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`${filename}: missing YAML frontmatter`);
  const metadata = yaml.load(match[1]) || {};
  return { metadata, body: raw.slice(match[0].length).trim() };
}

export function validateArticle(metadata, filename) {
  const errors = [];
  for (const key of ["id", "title", "workspace", "source_name", "published_date", "source_url", "content_type"]) {
    if (!metadata[key]) errors.push(`${filename}: missing ${key}`);
  }
  if (metadata.workspace && !Object.values(workspaceFolders).includes(metadata.workspace)) errors.push(`${filename}: unknown workspace ${metadata.workspace}`);
  if (metadata.source_url) {
    try {
      const url = new URL(String(metadata.source_url));
      if (url.protocol !== "https:" || url.hostname !== "mp.weixin.qq.com" || !url.pathname.startsWith("/s")) errors.push(`${filename}: source_url is not a WeChat article URL`);
    } catch { errors.push(`${filename}: invalid source_url`); }
  }
  if (metadata.published_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(metadata.published_date))) errors.push(`${filename}: published_date must be YYYY-MM-DD`);
  return errors;
}

export function articleFromDocument(file, contentRoot) {
  const raw = fs.readFileSync(file, "utf8");
  const { metadata, body } = parseFrontmatter(raw, path.relative(contentRoot, file));
  const errors = validateArticle(metadata, path.relative(contentRoot, file));
  const clean = body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    errors,
    relativePath: path.relative(contentRoot, file).replaceAll(path.sep, "/"),
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
    article: {
      id: String(metadata.id), title: String(metadata.title), knowledgeBase: String(metadata.workspace),
      source: String(metadata.source_name), publishedDate: String(metadata.published_date), sourceUrl: String(metadata.source_url),
      category: String(metadata.content_type), status: String(metadata.validity_status || "无法确定"),
      deadline: metadata.registration_deadline ? String(metadata.registration_deadline) : undefined,
      eventDate: metadata.activity_start_date ? String(metadata.activity_start_date) : undefined,
      excerpt: String(metadata.summary || clean.slice(0, 220)).trim(), content: clean,
    },
  };
}

export function loadDocuments(projectRoot = process.cwd()) {
  const contentRoot = path.join(projectRoot, "content");
  return walkMarkdown(contentRoot).map(file => articleFromDocument(file, contentRoot));
}
