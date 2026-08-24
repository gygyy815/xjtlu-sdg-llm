import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";
import {
  composeEvidenceBundle as composeEvidenceBundleV11,
  type EvidenceBundle,
} from "@/lib/evidence-composer";
import type { RetrievalPlan } from "@/lib/retrieval-v24";

export const EVIDENCE_COMPOSER_VERSION = "1.2";

function compact(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value: string | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\.md\b/g, "")
    .replace(/[_＿|｜—–\-，。；：、！？【】（）()\[\]{}<>“”‘’'"`\s]+/g, "");
}

function cleanText(value: string | undefined) {
  return String(value || "")
    .replace(/<document_metadata>[\s\S]*?<\/document_metadata>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function numberedTargets(question: string) {
  return question
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+[.、)）]\s*(.+?)\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 8);
}

function isTemporal(question: string) {
  return /(日期|时间|截止|结束|失效|有效|报名|之前|以后|截至|ended|deadline|date|time|expired|validity)/i.test(question);
}

function parentChildTarget(target: string) {
  const match = target.match(/^(.{3,60}?)的(.{2,40})$/);
  if (!match) return null;
  return { parent: compact(match[1]), child: compact(match[2]) };
}

function sameDocument(a: Citation, b: Citation) {
  if (a.url && b.url) return a.url === b.url;
  const left = normalize(a.title);
  const right = normalize(b.title);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function splitChunks(item: Citation) {
  const rows = String(item.text || "")
    .split(/<retrieval_chunk>/i)
    .map(cleanText)
    .filter(Boolean);
  return rows.length ? rows : [cleanText(item.text)].filter(Boolean);
}

function hasDateRange(text: string) {
  return /(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日\s*(?:至|到|[-–—~～])\s*(?:20\d{2}年)?\s*\d{1,2}月\s*\d{1,2}日/i.test(text)
    || /\b\d{1,2}\s+[A-Za-z]{3,9}\s*(?:[-–—]|to)\s*\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\b/i.test(text);
}

function candidateDocument(results: Citation[], parent: string, child: string) {
  const parentNorm = normalize(parent);
  const childNorm = normalize(child);
  return results
    .map((item, index) => {
      const title = normalize(item.title);
      const text = normalize(String(item.text || "").slice(0, 9000));
      let score = 0;
      if (parentNorm && title.includes(parentNorm)) score += 60;
      if (childNorm && title.includes(childNorm)) score += 40;
      if (parentNorm && text.includes(parentNorm)) score += 12;
      if (childNorm && text.includes(childNorm)) score += 10;
      return { item, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
}

function chunkScore(chunk: string, parent: string, child: string) {
  const normalized = normalize(chunk);
  const parentNorm = normalize(parent);
  const childNorm = normalize(child);
  let score = 0;
  if (childNorm && normalized.includes(childNorm)) score += 80;
  if (parentNorm && normalized.includes(parentNorm)) score += 20;
  if (hasDateRange(chunk)) score += 45;
  if (/(方向选择|方向|项目时间|活动时间|日期|时间)/i.test(chunk)) score += 12;
  return score;
}

function mergeCitationRows(items: Citation[]) {
  const merged = new Map<string, Citation>();
  for (const item of items) {
    const key = item.url ? `url:${item.url}` : `title:${normalize(item.title)}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item });
      continue;
    }
    const left = cleanText(current.text);
    const right = cleanText(item.text);
    let text = current.text;
    if (right && !left.includes(right)) {
      text = left && right.includes(left) ? item.text : `${current.text || ""}\n\n<retrieval_chunk>\n${item.text || ""}`.slice(0, 32000);
    }
    merged.set(key, {
      ...current,
      text,
      url: current.url || item.url,
      source: current.source || item.source,
      publishedDate: current.publishedDate || item.publishedDate,
    });
  }
  return [...merged.values()];
}

function evidenceBlock(target: string, item: Citation, excerpt: string, compactMode: boolean) {
  const body = excerpt.slice(0, compactMode ? 520 : 820);
  return [
    `\n[证据槽位：目标活动：${target} · 日期补强]`,
    "证据 1",
    `标题: ${String(item.title || "Knowledge-base source").replace(/\.md$/i, "")}`,
    item.source ? `来源: ${item.source}` : "",
    item.publishedDate ? `文章发布日期: ${item.publishedDate}` : "",
    item.url ? `原文链接: ${item.url}` : "",
    `正文摘录: ${body}`,
  ].filter(Boolean).join("\n");
}

async function targetedTemporalRefinement(
  workspace: string,
  question: string,
  plan: RetrievalPlan,
  results: Citation[],
) {
  if (!isTemporal(question)) return { blocks: [] as string[], compactBlocks: [] as string[], citations: [] as Citation[], slots: [] as EvidenceBundle["slots"], warnings: [] as string[] };

  const blocks: string[] = [];
  const compactBlocks: string[] = [];
  const citations: Citation[] = [];
  const slots: EvidenceBundle["slots"] = [];
  const warnings: string[] = [];

  for (const [index, target] of numberedTargets(question).entries()) {
    const parsed = parentChildTarget(target);
    if (!parsed) continue;

    const baseCandidate = candidateDocument(results, parsed.parent, parsed.child);
    const queries = [
      `${parsed.parent} ${parsed.child} 方向选择 日期 时间 开始 结束`,
      `${parsed.parent} 方向选择 ${parsed.child} 项目时间 活动时间`,
      `${parsed.child} ${parsed.parent} 日期 时间 start end`,
      `${parsed.parent} ${parsed.child} 月 日`,
    ];

    const rows: Citation[] = [];
    for (const query of [...new Set(queries.map(compact).filter(Boolean))]) {
      try {
        rows.push(...await vectorSearchAnythingLLM(workspace, query, 12, Math.min(plan.threshold, 0.12)));
      } catch (error) {
        warnings.push(`${target}: ${error instanceof Error ? error.message : "target refinement failed"}`);
      }
    }

    const mergedRows = mergeCitationRows(rows);
    const candidate = baseCandidate && baseCandidate.score >= 12 ? baseCandidate.item : candidateDocument(mergedRows, parsed.parent, parsed.child)?.item;
    const sameDocRows = candidate ? mergedRows.filter((item) => sameDocument(item, candidate)) : mergedRows;

    const best = sameDocRows
      .flatMap((item) => splitChunks(item).map((chunk) => ({ item, chunk, score: chunkScore(chunk, parsed.parent, parsed.child) })))
      .filter((row) => normalize(row.chunk).includes(normalize(parsed.child)) && hasDateRange(row.chunk))
      .sort((a, b) => b.score - a.score)[0];

    if (!best) continue;

    const refinedCitation: Citation = { ...best.item, text: best.chunk };
    citations.push(refinedCitation);
    blocks.push(evidenceBlock(target, refinedCitation, best.chunk, false));
    compactBlocks.push(evidenceBlock(target, refinedCitation, best.chunk, true));
    slots.push({
      id: `target-refine-${index + 1}`,
      label: `目标活动：${target} · 日期补强`,
      target,
      evidenceCount: 1,
    });
  }

  return { blocks, compactBlocks, citations: mergeCitationRows(citations), slots, warnings };
}

export async function composeEvidenceBundle(
  workspace: string,
  question: string,
  plan: RetrievalPlan,
  results: Citation[],
): Promise<EvidenceBundle> {
  const base = await composeEvidenceBundleV11(workspace, question, plan, results);
  const refinement = await targetedTemporalRefinement(workspace, question, plan, results);

  if (!refinement.blocks.length) {
    return { ...base, version: EVIDENCE_COMPOSER_VERSION };
  }

  const rule = "\n[Answer Grounding 1.2 日期目标补强]\n若同一目标同时存在普通目标槽位与“日期补强”槽位，日期/展期/截止判断优先采用日期补强槽位中的同一文章正文；不得用其他活动日期替代。";
  const prompt = `${base.prompt}${rule}${refinement.blocks.join("\n")}`.slice(0, 15600);
  const compactPrompt = `${base.compactPrompt}${rule}${refinement.compactBlocks.join("\n")}`.slice(0, 8600);

  return {
    ...base,
    version: EVIDENCE_COMPOSER_VERSION,
    prompt,
    compactPrompt,
    citations: mergeCitationRows([...base.citations, ...refinement.citations]),
    slots: [...base.slots, ...refinement.slots],
    warning: [base.warning, ...refinement.warnings].filter(Boolean).join(" | ") || undefined,
  };
}
