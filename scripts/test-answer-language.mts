import assert from "node:assert/strict";
import { answerLanguageInstruction, detectAnswerLanguage } from "../lib/answer-language.ts";

const cases = [
  ["请介绍近期校园活动", "zh"],
  ["What joint exhibition was organised by XJTLU Library?", "en"],
  ["What is SDG 4?", "en"],
  ["请解释 SDG 4", "zh"],
  ["XJTLU Library 有什么活动?", "zh"],
] as const;

for (const [question, expected] of cases) {
  assert.equal(detectAnswerLanguage(question), expected, `unexpected language for: ${question}`);
}

const englishInstruction = answerLanguageInstruction("What activities are available?");
assert.match(englishInstruction, /Answer in English/i);
assert.match(englishInstruction, /Do not translate or rewrite source titles/i);

const chineseInstruction = answerLanguageInstruction("有哪些活动？");
assert.match(chineseInstruction, /使用中文回答/);

console.log("Answer-language routing tests passed.");
