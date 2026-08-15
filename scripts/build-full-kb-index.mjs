import { createHash } from "node:crypto";
import { opendir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkdownDocument } from "../lib/knowledge-base/parser.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DIGEST_MAX_LENGTH = 240;

function fail(message) {
  console.error(`Full knowledge-base index failed: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  let limit;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    let value;

    if (argument === "--limit") {
      value = argv[index + 1];
      index += 1;
    } else if (argument.startsWith("--limit=")) {
      value = argument.slice("--limit=".length);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }

    if (limit !== undefined) {
      throw new Error("--limit may only be specified once");
    }

    if (!/^\d+$/.test(value ?? "") || Number(value) < 1) {
      throw new Error("--limit must be a positive integer");
    }

    limit = Number(value);
    if (!Number.isSafeInteger(limit)) {
      throw new Error("--limit is too large");
    }
  }

  return { limit };
}

async function collectMarkdownPaths(root) {
  const relativePaths = [];

  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(root, relativeDirectory);
    const directory = await opendir(absoluteDirectory);

    for await (const entry of directory) {
      const relativeEntry = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(relativeEntry);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        relativePaths.push(relativeEntry.split(path.sep).join("/"));
      }
    }
  }

  await visit("");
  return relativePaths.sort((left, right) => left.localeCompare(right, "en"));
}

function cleanScalar(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function readableFilename(relativePath) {
  const basename = path.posix.basename(relativePath, path.posix.extname(relativePath));
  let decoded = basename;
  try {
    decoded = decodeURIComponent(basename);
  } catch {
    // A literal percent sign in a filename is harmless; use the original name.
  }
  return decoded.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isValidCalendarDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizeDate(value) {
  const raw = cleanScalar(value);
  if (!raw) return undefined;

  const match = raw.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?)?$/,
  );
  if (!match) return undefined;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) return undefined;

  const date = `${yearText}-${monthText}-${dayText}`;
  if (hourText === undefined) return date;

  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return undefined;

  const normalizedZone = zone?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") ?? "";
  return `${date}T${hourText}:${minuteText}:${String(second).padStart(2, "0")}${normalizedZone}`;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeUrl(value) {
  const raw = cleanScalar(value);
  if (!raw) return undefined;

  try {
    const parsed = new URL(decodeHtmlEntities(raw));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    parsed.hash = "";
    return parsed.href;
  } catch {
    return undefined;
  }
}

function canonicalizeUrl(sourceUrl) {
  const parsed = new URL(sourceUrl);
  parsed.hash = "";

  if (/(^|\.)weixin\.qq\.com$/i.test(parsed.hostname)) {
    for (const parameter of [
      "scene",
      "ascene",
      "from",
      "isappinstalled",
      "sessionid",
      "clicktime",
      "enterid",
      "devicetype",
      "version",
      "nettype",
      "lang",
      "pass_ticket",
      "wx_header",
    ]) {
      parsed.searchParams.delete(parameter);
    }
  }

  parsed.searchParams.sort();
  return parsed.href;
}

function stableId(sourceUrl, relativePath) {
  const identity = sourceUrl
    ? `url:${canonicalizeUrl(sourceUrl)}`
    : `path:${relativePath}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 16);
}

function cleanMarkdownParagraph(lines) {
  let text = lines.join(" ");
  text = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~]+/g, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function fallbackDigest(body) {
  const paragraphs = [];
  let current = [];
  let inCodeFence = false;

  function flush() {
    if (current.length > 0) paragraphs.push(cleanMarkdownParagraph(current));
    current = [];
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) {
      flush();
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const isNoise =
      !line ||
      /^#{1,6}\s/.test(line) ||
      /^>/.test(line) ||
      /^!\[[^\]]*\]\([^)]*\)\s*$/.test(line) ||
      /^(?:---+|___+|\*\*\*+)\s*$/.test(line) ||
      /^<\/?(?:img|figure|figcaption|source|video)\b/i.test(line);

    if (isNoise) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();

  const paragraph = paragraphs.find(
    (candidate) =>
      candidate.length >= 8 &&
      /[\p{L}\p{N}\p{Script=Han}]/u.test(candidate) &&
      !/^(?:阅读原文|点击.*(?:阅读|关注)|原文链接)$/u.test(candidate),
  );
  if (!paragraph) return undefined;
  if (paragraph.length <= DIGEST_MAX_LENGTH) return paragraph;
  return `${paragraph.slice(0, DIGEST_MAX_LENGTH - 1).trimEnd()}…`;
}

function increment(object, field) {
  object[field] = (object[field] ?? 0) + 1;
}

function makeWarning(report, relativePath, code, message, field) {
  report.warningCount += 1;
  report.warnings.push({ relativePath, code, ...(field ? { field } : {}), message });
}

async function writeJsonAtomically(destination, value) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  const outputSuffix = options.limit === undefined ? "" : ".preview";
  const indexPath = path.join(
    PROJECT_ROOT,
    `data/full-kb-index${outputSuffix}.json`,
  );
  const reportPath = path.join(
    PROJECT_ROOT,
    `data/full-kb-index-report${outputSuffix}.json`,
  );

  const configuredRoot = process.env.KB_MARKDOWN_ROOT;
  if (!configuredRoot?.trim()) {
    fail("KB_MARKDOWN_ROOT is required and must point to the Markdown corpus");
    return;
  }

  const sourceRoot = path.resolve(configuredRoot);
  try {
    const sourceStat = await stat(sourceRoot);
    if (!sourceStat.isDirectory()) throw new Error("path is not a directory");
  } catch (error) {
    fail(`KB_MARKDOWN_ROOT does not identify a readable directory: ${sourceRoot} (${error.message})`);
    return;
  }

  let allPaths;
  try {
    allPaths = await collectMarkdownPaths(sourceRoot);
  } catch (error) {
    fail(`could not traverse KB_MARKDOWN_ROOT: ${error.message}`);
    return;
  }

  const selectedPaths =
    options.limit === undefined ? allPaths : allPaths.slice(0, options.limit);
  const report = {
    sourceRoot,
    limit: options.limit ?? null,
    scanned: selectedPaths.length,
    indexed: 0,
    skipped: 0,
    warningCount: 0,
    duplicateIdCount: 0,
    missingFields: {},
    warnings: [],
    skippedDocuments: [],
    duplicateIds: [],
  };
  const summaries = [];
  const pathsById = new Map();

  for (const relativePath of selectedPaths) {
    let document;
    try {
      const source = await readFile(path.join(sourceRoot, relativePath), "utf8");
      document = parseMarkdownDocument(source);
    } catch (error) {
      report.skipped += 1;
      report.skippedDocuments.push({
        relativePath,
        reason: `could not read or parse frontmatter: ${error.message}`,
      });
      continue;
    }

    const { metadata, body, missingFrontmatter } = document;
    if (missingFrontmatter) {
      makeWarning(
        report,
        relativePath,
        "missing_frontmatter",
        "No YAML frontmatter block was found",
      );
    }

    let title = cleanScalar(metadata.title);
    if (!title) {
      increment(report.missingFields, "title");
      title = readableFilename(relativePath);
      makeWarning(
        report,
        relativePath,
        "title_derived_from_filename",
        "Title was missing or empty and was derived from the filename",
        "title",
      );
    }

    const author = cleanScalar(metadata.author);
    if (!author) {
      increment(report.missingFields, "author");
      makeWarning(report, relativePath, "missing_author", "Author is missing", "author");
    }

    let account = cleanScalar(metadata.account);
    if (!account) {
      increment(report.missingFields, "account");
      const segments = relativePath.split("/");
      account = segments.length > 1 ? segments[0].trim() : "";
      makeWarning(
        report,
        relativePath,
        "account_derived_from_path",
        account
          ? "Account was missing or empty and was derived from the first directory segment"
          : "Account was missing and no directory segment was available",
        "account",
      );
    }

    const rawDate = cleanScalar(metadata.date);
    const publishedAt = normalizeDate(rawDate);
    if (!publishedAt) {
      increment(report.missingFields, "publishedAt");
      makeWarning(
        report,
        relativePath,
        rawDate ? "invalid_date" : "missing_date",
        rawDate ? `Date could not be safely normalized: ${rawDate}` : "Date is missing",
        "publishedAt",
      );
    }

    const rawUrl = cleanScalar(metadata.url);
    const sourceUrl = normalizeUrl(rawUrl);
    if (!sourceUrl) {
      increment(report.missingFields, "sourceUrl");
      makeWarning(
        report,
        relativePath,
        rawUrl ? "invalid_url" : "missing_url",
        rawUrl ? "URL is not a valid HTTP/HTTPS URL" : "URL is missing",
        "sourceUrl",
      );
    }

    const frontmatterDigest = cleanScalar(metadata.digest);
    let digest = frontmatterDigest;
    let digestSource = "frontmatter";
    if (!digest) {
      increment(report.missingFields, "digest");
      digest = fallbackDigest(body);
      digestSource = digest ? "body_fallback" : "none";
      makeWarning(
        report,
        relativePath,
        "missing_digest",
        digest
          ? "Digest was missing; a fallback was derived from the Markdown body"
          : "Digest was missing and no meaningful body fallback was found",
        "digest",
      );
    }

    if (!title) {
      report.skipped += 1;
      report.skippedDocuments.push({
        relativePath,
        reason: "document has no usable title or filename",
      });
      continue;
    }

    const id = stableId(sourceUrl, relativePath);
    const existingPath = pathsById.get(id);
    if (existingPath) {
      report.duplicateIdCount += 1;
      report.duplicateIds.push({ id, firstRelativePath: existingPath, relativePath });
      continue;
    }
    pathsById.set(id, relativePath);

    summaries.push({
      id,
      title,
      ...(author ? { author } : {}),
      account,
      ...(publishedAt ? { publishedAt } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(digest ? { digest } : {}),
      digestSource,
      relativePath,
    });
  }

  report.indexed = summaries.length;

  try {
    await writeJsonAtomically(indexPath, summaries);
    await writeJsonAtomically(reportPath, report);
  } catch (error) {
    fail(`could not write index outputs: ${error.message}`);
    return;
  }

  console.log(
    `Scanned ${report.scanned}; indexed ${report.indexed}; skipped ${report.skipped}; warnings ${report.warningCount}; duplicate IDs ${report.duplicateIdCount}.`,
  );
  console.log(`Index: ${indexPath}`);
  console.log(`Report: ${reportPath}`);
}

await main();
