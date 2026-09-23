import { pipeline } from "@huggingface/transformers";

type PreloadRequest = {
  type: "preload";
  id: string;
};

type TranslateRequest = {
  type: "translate";
  id: string;
  text: string;
};

type LiveTranslationRequest =
  | PreloadRequest
  | TranslateRequest;

type LiveTranslationResponse =
  | {
      type: "ready";
      id: string;
    }
  | {
      type: "result";
      id: string;
      text: string;
    }
  | {
      type: "error";
      id: string;
      error: string;
    };

type TranslationItem = {
  translation_text: string;
};

type TranslationResult =
  | TranslationItem
  | TranslationItem[];

type LiveTranslationPipeline = (
  text: string,
  options?: {
    num_beams?: number;
    do_sample?: boolean;
  }
) => Promise<TranslationResult>;

type CreateTranslationPipeline = (
  task: "translation",
  model: string,
  options: {
    dtype: "q8";
    device: "wasm";
  }
) => Promise<LiveTranslationPipeline>;

const createTranslationPipeline =
  pipeline as unknown as CreateTranslationPipeline;

let translator:
  LiveTranslationPipeline | null = null;

let translatorPromise:
  Promise<LiveTranslationPipeline> | null = null;

async function getTranslator(): Promise<LiveTranslationPipeline> {
  if (translator) {
    return translator;
  }

  if (translatorPromise) {
    return translatorPromise;
  }

  console.log(
    "[liveTranslation.worker] Carregando tradutor rápido..."
  );

  translatorPromise =
    createTranslationPipeline(
      "translation",
      "Xenova/opus-mt-ROMANCE-en",
      {
        dtype: "q8",
        device: "wasm",
      }
    )
      .then(
        (
          createdTranslator
        ) => {
          translator =
            createdTranslator;

          console.log(
            "[liveTranslation.worker] Tradutor rápido pronto."
          );

          return createdTranslator;
        }
      )
      .catch(
        (
          error:
            unknown
        ) => {
          translatorPromise =
            null;

          throw error;
        }
      );

  return translatorPromise;
}

function getTranslatedText(
  result:
    TranslationResult
): string {
  if (
    Array.isArray(result)
  ) {
    return (
      result[0]
        ?.translation_text ??
      ""
    );
  }

  return (
    result.translation_text ??
    ""
  );
}

self.onmessage = async (
  event:
    MessageEvent<LiveTranslationRequest>
) => {
  const request =
    event.data;

  try {
    if (
      request.type ===
      "preload"
    ) {
      await getTranslator();

      const response:
        LiveTranslationResponse = {
          type: "ready",
          id: request.id,
        };

      self.postMessage(
        response
      );

      return;
    }

    const translationPipeline =
      await getTranslator();

    const startedAt =
      performance.now();

    /*
     * num_beams = 1:
     * priorizamos latência no modo
     * ao vivo em vez de beam search.
     */
    const result =
      await translationPipeline(
        request.text,
        {
          num_beams: 1,
          do_sample: false,
        }
      );

    const translatedText =
      getTranslatedText(
        result
      );

    console.log(
      "[liveTranslation.worker] Tradução:",
      {
        milliseconds:
          Math.round(
            performance.now() -
              startedAt
          ),

        source:
          request.text,

        result:
          translatedText,
      }
    );

    const response:
      LiveTranslationResponse = {
        type: "result",
        id: request.id,
        text:
          translatedText,
      };

    self.postMessage(
      response
    );
  } catch (
    error:
      unknown
  ) {
    console.error(
      "[liveTranslation.worker] Erro:",
      error
    );

    const response:
      LiveTranslationResponse = {
        type: "error",
        id: request.id,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      };

    self.postMessage(
      response
    );
  }
};