import { pipeline } from "@huggingface/transformers";

/*
 * Dados que o React envia para o Worker.
 */
type TranslationRequest = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};

/*
 * Dados que o Worker devolve para o React.
 */
type TranslationResponse = {
  translatedText?: string;
  error?: string;
};

/*
 * Opções usadas pelo modelo NLLB durante a tradução.
 */
type TranslationOptions = {
  src_lang: string;
  tgt_lang: string;
};

/*
 * Formato do resultado que esperamos da pipeline.
 */
type TranslationResult = {
  translation_text: string;
};

/*
 * Criamos nossa própria definição mínima da pipeline.
 *
 * Não precisamos representar os milhares de tipos internos
 * da biblioteca Hugging Face.
 *
 * Precisamos apenas representar aquilo que o Echo realmente usa.
 */
type TranslationPipeline = (
  text: string,
  options: TranslationOptions
) => Promise<TranslationResult[]>;

/*
 * Também criamos uma assinatura simplificada para a função
 * que cria nossa pipeline.
 */
type CreateTranslationPipeline = (
  task: "translation",
  model: string,
  options: {
    dtype: "q8";
    device: "wasm";
  }
) => Promise<TranslationPipeline>;

/*
 * Adaptamos a função da Hugging Face para a interface
 * que o Echo realmente precisa.
 */
const createTranslationPipeline =
  pipeline as unknown as CreateTranslationPipeline;

/*
 * O modelo começa sem estar carregado.
 */
let translator: TranslationPipeline | null = null;

/*
 * Lazy loading:
 *
 * - primeira chamada -> carrega o modelo;
 * - próximas chamadas -> reutilizam o modelo.
 */
async function getTranslator(): Promise<TranslationPipeline> {
  if (!translator) {
    translator = await createTranslationPipeline(
      "translation",
      "Xenova/nllb-200-distilled-600M",
      {
        dtype: "q8",
        device: "wasm",
      }
    );
  }

  return translator;
}

/*
 * Escuta mensagens enviadas pelo translationClient.
 */
self.onmessage = async (
  event: MessageEvent<TranslationRequest>
) => {
  const {
    text,
    sourceLanguage,
    targetLanguage,
  } = event.data;

  try {
    const translationPipeline = await getTranslator();

    const result = await translationPipeline(text, {
      src_lang: sourceLanguage,
      tgt_lang: targetLanguage,
    });

    const translatedText =
      result.length > 0
        ? result[0].translation_text
        : "";

    const response: TranslationResponse = {
      translatedText,
    };

    self.postMessage(response);
  } catch (error) {
    console.error("Erro no Worker:", error);

    const response: TranslationResponse = {
      error:
        error instanceof Error
          ? error.message
          : "Erro desconhecido durante a tradução.",
    };

    self.postMessage(response);
  }
};