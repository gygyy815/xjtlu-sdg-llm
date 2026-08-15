import yaml from "js-yaml";

/**
 * Parse a Markdown document with an optional YAML frontmatter block.
 *
 * The full knowledge base contains legacy documents without frontmatter, so
 * callers receive a flag instead of an exception for that case. Invalid YAML
 * and non-mapping frontmatter still fail loudly.
 */
export function parseMarkdownDocument(source) {
  const normalizedSource = source.replace(/^\uFEFF/, "");
  const match = normalizedSource.match(
    /^(?:[ \t]*\r?\n)*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );

  if (!match) {
    return {
      metadata: {},
      body: normalizedSource,
      missingFrontmatter: true,
    };
  }

  const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
  if (parsed == null) {
    return {
      metadata: {},
      body: normalizedSource.slice(match[0].length),
      missingFrontmatter: false,
    };
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter must be a YAML mapping");
  }

  return {
    metadata: parsed,
    body: normalizedSource.slice(match[0].length),
    missingFrontmatter: false,
  };
}
