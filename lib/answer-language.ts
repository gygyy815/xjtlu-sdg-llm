export type AnswerLanguage = "zh" | "en";

const CJK_RE = /[\u3400-\u9fff]/;
const LATIN_WORD_RE = /[A-Za-z]{2,}/g;

export function detectAnswerLanguage(message: string): AnswerLanguage {
  const text = String(message || "").trim();
  if (!text) return "zh";

  const hasChinese = CJK_RE.test(text);
  const latinWords = text.match(LATIN_WORD_RE)?.length || 0;

  // Keep Chinese as the safe default for mixed-language prompts. Purely or
  // overwhelmingly English questions should receive English answers.
  if (!hasChinese && latinWords > 0) return "en";
  return "zh";
}

export function answerLanguageInstruction(message: string) {
  const language = detectAnswerLanguage(message);
  if (language === "en") {
    return [
      "\n[Answer Language]",
      "Answer in English because the user's question is in English.",
      "Do not translate or rewrite source titles, quotations, dates, numbers, proper nouns, or URLs unless the user explicitly asks for translation.",
      "If a required fact is missing from the evidence, say that the document does not explicitly state it; do not guess.",
    ].join("\n");
  }

  return [
    "\n[回答语言]",
    "使用中文回答，因为用户问题包含中文或主要以中文表达。",
    "来源标题、引文、日期、数字、专有名词和 URL 保持证据中的原样，除非用户明确要求翻译。",
  ].join("\n");
}
