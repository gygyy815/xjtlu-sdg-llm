import fs from "node:fs";
import path from "node:path";
import { loadDocuments } from "../lib/knowledge-content.mjs";

const docs = loadDocuments();
const output = path.join(process.cwd(), "data", "articles.generated.json");

// Public checkouts intentionally do not include the full knowledge-base source
// documents. Keep the committed metadata-only index until an administrator
// adds local content files and explicitly rebuilds it.
if (docs.length === 0 && fs.existsSync(output)) {
  console.log("No local content files found; keeping the committed metadata-only article index.");
  process.exit(0);
}

const errors = docs.flatMap(doc => doc.errors);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(docs.map(doc => doc.article).sort((a, b) => b.publishedDate.localeCompare(a.publishedDate)), null, 2) + "\n");
console.log(`Generated ${docs.length} articles -> data/articles.generated.json`);
