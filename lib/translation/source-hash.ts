import { createHash } from "node:crypto";

type TranslationSource = {
  title: string;
  summary?: string;
  digest?: string;
  content: string;
};

/** Hash exactly the source fields that affect translation output. */
export function translationSourceHash(source: TranslationSource) {
  return createHash("sha256")
    .update(source.title, "utf8")
    .update("\0", "utf8")
    .update(source.summary ?? source.digest ?? "", "utf8")
    .update("\0", "utf8")
    .update(source.content, "utf8")
    .digest("hex");
}
