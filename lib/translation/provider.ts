import type {
  TranslationProviderInput,
  TranslationProviderOutput,
} from "./types";

export interface TranslationProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Translate article fields while preserving Markdown structure, code, and
   * every URL exactly. Providers must not add commentary around the content.
   */
  translateArticle(
    input: TranslationProviderInput,
  ): Promise<TranslationProviderOutput>;
}

/**
 * A no-network provider for pipeline validation. It deliberately returns the
 * source text unchanged instead of pretending to be a real English result.
 */
export class MockTranslationProvider implements TranslationProvider {
  readonly name = "mock";
  readonly model = "identity-v1";

  async translateArticle(input: TranslationProviderInput) {
    return {
      title: input.title,
      ...(input.digest === undefined ? {} : { digest: input.digest }),
      content: input.content,
    };
  }
}
