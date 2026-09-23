export type TranslateTextParams = {
  text: string;
  targetLanguage: string;
};

export async function translateText({
  text,
  targetLanguage,
}: TranslateTextParams): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 800));

  return `[${targetLanguage}] ${text}`;
}