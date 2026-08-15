export type MarkdownMetadata = Record<string, unknown>;

export type ParsedMarkdownDocument = {
  metadata: MarkdownMetadata;
  body: string;
  missingFrontmatter: boolean;
};

export function parseMarkdownDocument(source: string): ParsedMarkdownDocument;
