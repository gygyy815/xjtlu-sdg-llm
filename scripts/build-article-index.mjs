import fs from "node:fs";
import path from "node:path";

const inputRoot = process.argv[2];
const outputFile = process.argv[3] || "data/articles.json";
if (!inputRoot) throw new Error("Usage: node scripts/build-article-index.mjs <extracted-library-root> [output]");

const knowledgeBases = {
  "KB-01_西交利物浦大学": "西交利物浦大学",
  "KB-02_西交利物浦大学图书馆": "西交利物浦大学图书馆",
  "KB-03_西浦学生服务": "西浦学生服务",
};

function plainText(markdown) {
  return markdown
    .replace(/^!\[[^\]]*\]\([^\n]+\)$/gm, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/^>\s*原文地址:.*$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[>*_`]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function categoryFor(title, body) {
  const text = `${title} ${body.slice(0, 400)}`;
  if (/培训|讲座|workshop|lecture/i.test(text)) return "培训讲座";
  if (/通知|须知|指南|方案|调整|提示/.test(text)) return "通知指南";
  if (/招募|报名|活动|展览|书展|夏令营|大赛|国际日|年会/.test(text)) return "活动机会";
  if (/研究|教授|可持续|SDG|生态|AI/i.test(text)) return "研究与可持续发展";
  return "校园资讯";
}

function findDateContext(body, label) {
  const lines = body.split(/\n/).map(line => line.trim()).filter(Boolean);
  const direct = lines.find(line => label.test(line) && /(?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}/.test(line));
  return direct?.replace(/^[-•●\s]+/, "").slice(0, 180);
}

function validity(body, category) {
  const deadline = findDateContext(body, /截止|报名|征集时间|申请时间/);
  const eventDate = findDateContext(body, /活动时间|展览时间|培训时间|讲座时间|开放时间|时间[:：]/);
  if (deadline) return { status: "需核查截止日期", deadline, eventDate };
  if (eventDate) return { status: "需核查活动日期", deadline, eventDate };
  if (category === "活动机会" || category === "培训讲座") return { status: "无法确定", deadline, eventDate };
  return { status: "长期信息", deadline, eventDate };
}

const articles = [];
for (const [folder, knowledgeBase] of Object.entries(knowledgeBases)) {
  const directory = path.join(inputRoot, folder);
  for (const filename of fs.readdirSync(directory).filter(name => name.endsWith(".md")).sort()) {
    const markdown = fs.readFileSync(path.join(directory, filename), "utf8");
    const lines = markdown.split(/\r?\n/);
    const title = lines.find(line => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() || filename.replace(/\.md$/, "");
    const header = lines.slice(1, 5).join(" ").replace(/\s+/g, " ").trim();
    const published = header.match(/20\d{2}-\d{2}-\d{2}/)?.[0];
    const sourceUrl = markdown.match(/原文地址:\s*\[[^\]]+\]\((https:\/\/mp\.weixin\.qq\.com\/s\/[A-Za-z0-9_-]+)\)/)?.[1];
    const byline = header.replace(/20\d{2}-\d{2}-\d{2}.*$/, "").replace(/^原创\s*/, "").trim();
    const content = plainText(lines.slice(5).join("\n"));
    const category = categoryFor(title, content);
    const timing = validity(content, category);
    const id = `${folder.slice(0, 5).toLowerCase()}-${String(articles.length + 1).padStart(2, "0")}`;
    articles.push({
      id,
      title,
      knowledgeBase,
      source: byline || knowledgeBase,
      publishedDate: published,
      sourceUrl,
      category,
      ...timing,
      excerpt: content.replace(/\n/g, " ").slice(0, 220),
      content,
    });
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(articles, null, 2)}\n`);
console.log(`Indexed ${articles.length} articles into ${outputFile}`);
