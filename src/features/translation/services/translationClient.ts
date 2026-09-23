import { languages } from "../data/languages";

type TranslationWorkerResponse = {
  translatedText?: string;
  error?: string;
};

export function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = languages.find(
      (language) => language.code === sourceLanguage
    );

    const target = languages.find(
      (language) => language.code === targetLanguage
    );

    if (!source || !target) {
      reject(
        new Error("Idioma de origem ou destino inválido.")
      );

      return;
    }

    const worker = new Worker(
      new URL(
        "../workers/translation.worker.ts",
        import.meta.url
      ),
      {
        type: "module",
      }
    );

    worker.onmessage = (
      event: MessageEvent<TranslationWorkerResponse>
    ) => {
      if (event.data.error) {
        reject(new Error(event.data.error));

        worker.terminate();
        return;
      }

      resolve(event.data.translatedText ?? "");

      worker.terminate();
    };

    worker.onerror = (error) => {
      reject(error);

      worker.terminate();
    };

    worker.postMessage({
      text,
      sourceLanguage: source.modelCode,
      targetLanguage: target.modelCode,
    });
  });
}