export type TranslationGlossaryEntry = {
  source: string;
  target: string;
};

/** Small, high-value glossary of official institutional English names. */
export const TRANSLATION_GLOSSARY: readonly TranslationGlossaryEntry[] = [
  {
    source: "西交利物浦大学",
    target: "Xi'an Jiaotong-Liverpool University",
  },
  { source: "西浦", target: "XJTLU" },
  { source: "西安交通大学", target: "Xi'an Jiaotong University" },
  { source: "利物浦大学", target: "University of Liverpool" },
] as const;

export function translationGlossaryPrompt() {
  return [
    "Mandatory terminology glossary (use these mappings exactly when the corresponding Chinese term appears):",
    ...TRANSLATION_GLOSSARY.map(
      ({ source, target }) => `- ${source} → ${target}`,
    ),
    "Do not apply these mappings to unrelated substrings.",
  ].join("\n");
}
