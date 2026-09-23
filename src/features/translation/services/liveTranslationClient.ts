type PreloadRequest = {
  type: "preload";
  id: string;
};

type TranslateRequest = {
  type: "translate";
  id: string;
  text: string;
};

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

type PendingTranslation = {
  resolve: (
    text: string
  ) => void;

  reject: (
    error: Error
  ) => void;

  timeout:
    ReturnType<
      typeof setTimeout
    >;
};

type PendingPreload = {
  resolve: () => void;

  reject: (
    error: Error
  ) => void;

  timeout:
    ReturnType<
      typeof setTimeout
    >;
};

let worker:
  Worker | null = null;

let modelReady =
  false;

let preloadPromise:
  Promise<void> | null = null;

const pendingTranslations =
  new Map<
    string,
    PendingTranslation
  >();

const pendingPreloads =
  new Map<
    string,
    PendingPreload
  >();

const MODEL_TIMEOUT =
  300000;

const TRANSLATION_TIMEOUT =
  30000;

function createRequestId(): string {
  return crypto.randomUUID();
}

export function supportsFastLiveTranslation(
  sourceLanguage: string,
  targetLanguage: string
): boolean {
  const romanceLanguages =
    new Set([
      "pt",
      "es",
      "fr",
    ]);

  return (
    romanceLanguages.has(
      sourceLanguage
    ) &&
    targetLanguage ===
      "en"
  );
}

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    new URL(
      "../workers/liveTranslation.worker.ts",
      import.meta.url
    ),
    {
      type: "module",
    }
  );

  worker.onmessage = (
    event:
      MessageEvent<LiveTranslationResponse>
  ) => {
    const message =
      event.data;

    if (
      message.type ===
      "ready"
    ) {
      const pending =
        pendingPreloads.get(
          message.id
        );

      if (!pending) {
        return;
      }

      clearTimeout(
        pending.timeout
      );

      pendingPreloads.delete(
        message.id
      );

      modelReady =
        true;

      pending.resolve();

      return;
    }

    if (
      message.type ===
      "result"
    ) {
      const pending =
        pendingTranslations.get(
          message.id
        );

      if (!pending) {
        return;
      }

      clearTimeout(
        pending.timeout
      );

      pendingTranslations.delete(
        message.id
      );

      pending.resolve(
        message.text
      );

      return;
    }

    const error =
      new Error(
        message.error
      );

    const translation =
      pendingTranslations.get(
        message.id
      );

    if (translation) {
      clearTimeout(
        translation.timeout
      );

      pendingTranslations.delete(
        message.id
      );

      translation.reject(
        error
      );

      return;
    }

    const preload =
      pendingPreloads.get(
        message.id
      );

    if (preload) {
      clearTimeout(
        preload.timeout
      );

      pendingPreloads.delete(
        message.id
      );

      preload.reject(
        error
      );
    }
  };

  worker.onerror = (
    event:
      ErrorEvent
  ) => {
    console.error(
      "[liveTranslationClient] Worker:",
      event
    );

    modelReady =
      false;

    preloadPromise =
      null;
  };

  return worker;
}

export function preloadLiveTranslationModel(): Promise<void> {
  if (
    modelReady
  ) {
    return Promise.resolve();
  }

  if (
    preloadPromise
  ) {
    return preloadPromise;
  }

  const translationWorker =
    getWorker();

  const requestId =
    createRequestId();

  preloadPromise =
    new Promise<void>(
      (
        resolve,
        reject
      ) => {
        const timeout =
          setTimeout(
            () => {
              pendingPreloads.delete(
                requestId
              );

              preloadPromise =
                null;

              reject(
                new Error(
                  "O tradutor rápido demorou demais para carregar."
                )
              );
            },
            MODEL_TIMEOUT
          );

        pendingPreloads.set(
          requestId,
          {
            resolve,
            reject,
            timeout,
          }
        );

        const request:
          PreloadRequest = {
            type: "preload",
            id: requestId,
          };

        translationWorker.postMessage(
          request
        );
      }
    );

  preloadPromise =
    preloadPromise.catch(
      (
        error:
          unknown
      ) => {
        preloadPromise =
          null;

        throw error;
      }
    );

  return preloadPromise;
}

export async function translateLiveText(
  text: string
): Promise<string> {
  await preloadLiveTranslationModel();

  const translationWorker =
    getWorker();

  const requestId =
    createRequestId();

  return new Promise<string>(
    (
      resolve,
      reject
    ) => {
      const timeout =
        setTimeout(
          () => {
            pendingTranslations.delete(
              requestId
            );

            reject(
              new Error(
                "A tradução ao vivo demorou demais."
              )
            );
          },
          TRANSLATION_TIMEOUT
        );

      pendingTranslations.set(
        requestId,
        {
          resolve,
          reject,
          timeout,
        }
      );

      const request:
        TranslateRequest = {
          type: "translate",
          id: requestId,
          text,
        };

      translationWorker.postMessage(
        request
      );
    }
  );
}