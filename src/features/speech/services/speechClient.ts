import { prepareAudioForWhisper } from "../utils/audio";

type PreloadRequest = {
  type: "preload";
  id: string;
};

type TranscribeRequest = {
  type: "transcribe";
  id: string;
  audio: Float32Array;
  language: string;
};

type SpeechWorkerResponse =
  | {
      type: "status";
      id: string;
      status: string;
    }
  | {
      type: "progress";
      id: string;
      progress: number;
    }
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

type PendingTranscription = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type PendingPreload = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SpeechStatusCallback = (status: string) => void;

let worker: Worker | null = null;

let modelReady = false;

let preloadPromise: Promise<void> | null = null;

const pendingTranscriptions = new Map<
  string,
  PendingTranscription
>();

const pendingPreloads = new Map<
  string,
  PendingPreload
>();

const statusListeners = new Set<SpeechStatusCallback>();

const MODEL_TIMEOUT = 600000;
const TRANSCRIPTION_TIMEOUT = 60000;

function createRequestId(): string {
  return crypto.randomUUID();
}

function notifyStatus(status: string): void {
  console.log("[speechClient] Status:", status);

  statusListeners.forEach((callback) => {
    callback(status);
  });
}

export function subscribeSpeechStatus(
  callback: SpeechStatusCallback
): () => void {
  statusListeners.add(callback);

  return () => {
    statusListeners.delete(callback);
  };
}

function clearPendingRequests(error: Error): void {
  pendingTranscriptions.forEach((request) => {
    clearTimeout(request.timeout);
    request.reject(error);
  });

  pendingTranscriptions.clear();

  pendingPreloads.forEach((request) => {
    clearTimeout(request.timeout);
    request.reject(error);
  });

  pendingPreloads.clear();
}

function destroyWorker(): void {
  worker?.terminate();

  worker = null;
  modelReady = false;
  preloadPromise = null;
}

function normalizeProgress(progress: number): number {
  if (progress <= 1) {
    return Math.round(progress * 100);
  }

  return Math.round(progress);
}

function handleWorkerError(error: Error): void {
  console.error("[speechClient] Erro no Worker:", error);

  clearPendingRequests(error);
  destroyWorker();

  notifyStatus("Falha no reconhecimento de voz.");
}

function getWorker(): Worker {
  if (worker) {
    return worker;
  }

  console.log("[speechClient] Criando Worker...");

  worker = new Worker(
    new URL("../workers/speech.worker.ts", import.meta.url),
    {
      type: "module",
    }
  );

  console.log("[speechClient] Worker criado.");

  worker.onmessage = (
    event: MessageEvent<SpeechWorkerResponse>
  ) => {
    const message = event.data;

    console.log(
      "[speechClient] Mensagem recebida:",
      message
    );

    if (message.type === "status") {
      notifyStatus(message.status);
      return;
    }

    if (message.type === "progress") {
      const percentage = normalizeProgress(
        message.progress
      );

      notifyStatus(
        `Carregando Whisper: ${percentage}%`
      );

      return;
    }

    if (message.type === "ready") {
      const pending = pendingPreloads.get(message.id);

      if (!pending) {
        console.warn(
          "[speechClient] Preload sem requisição pendente:",
          message.id
        );

        return;
      }

      clearTimeout(pending.timeout);

      pendingPreloads.delete(message.id);

      modelReady = true;

      notifyStatus("Echo pronto para ouvir.");

      pending.resolve();

      return;
    }

    if (message.type === "result") {
      const pending =
        pendingTranscriptions.get(message.id);

      if (!pending) {
        console.warn(
          "[speechClient] Transcrição sem requisição pendente:",
          message.id
        );

        return;
      }

      clearTimeout(pending.timeout);

      pendingTranscriptions.delete(message.id);

      pending.resolve(message.text);

      return;
    }

    if (message.type === "error") {
      const error = new Error(message.error);

      const transcription =
        pendingTranscriptions.get(message.id);

      if (transcription) {
        clearTimeout(transcription.timeout);

        pendingTranscriptions.delete(message.id);

        transcription.reject(error);

        return;
      }

      const preload =
        pendingPreloads.get(message.id);

      if (preload) {
        clearTimeout(preload.timeout);

        pendingPreloads.delete(message.id);

        preload.reject(error);

        return;
      }

      console.error(
        "[speechClient] Erro sem requisição correspondente:",
        error
      );
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    handleWorkerError(
      new Error(
        event.message ||
          "Erro inesperado no Worker de fala."
      )
    );
  };

  worker.onmessageerror = () => {
    handleWorkerError(
      new Error(
        "Erro ao receber mensagem do Worker de fala."
      )
    );
  };

  return worker;
}

export function preloadSpeechModel(): Promise<void> {
  if (modelReady) {
    return Promise.resolve();
  }

  if (preloadPromise) {
    return preloadPromise;
  }

  const speechWorker = getWorker();
  const requestId = createRequestId();

  notifyStatus("Preparando inteligência de voz...");

  preloadPromise = new Promise<void>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingPreloads.delete(requestId);

        const error = new Error(
          "O Whisper demorou demais para carregar."
        );

        reject(error);

        destroyWorker();

        notifyStatus(
          "Falha ao carregar Whisper."
        );
      }, MODEL_TIMEOUT);

      pendingPreloads.set(requestId, {
        resolve,
        reject,
        timeout,
      });

      const request: PreloadRequest = {
        type: "preload",
        id: requestId,
      };

      console.log(
        "[speechClient] Enviando preload:",
        request
      );

      speechWorker.postMessage(request);
    }
  );

  preloadPromise = preloadPromise.catch(
    (error: unknown) => {
      preloadPromise = null;

      throw error;
    }
  );

  return preloadPromise;
}

export async function transcribeAudio(
  rawAudio: Float32Array,
  originalSampleRate: number,
  language: string
): Promise<string> {
  notifyStatus("Preparando áudio...");

  const audio = prepareAudioForWhisper(
    rawAudio,
    originalSampleRate
  );

  console.log("[speechClient] Áudio preparado:", {
    originalSampleRate,
    targetSampleRate: 16000,
    samples: audio.length,
    duration: audio.length / 16000,
  });

  await preloadSpeechModel();

  const speechWorker = getWorker();
  const requestId = createRequestId();

  notifyStatus("Enviando áudio para Whisper...");

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingTranscriptions.delete(requestId);

      reject(
        new Error(
          "A transcrição demorou mais de 1 minuto."
        )
      );

      notifyStatus(
        "Tempo limite da transcrição excedido."
      );
    }, TRANSCRIPTION_TIMEOUT);

    pendingTranscriptions.set(requestId, {
      resolve,
      reject,
      timeout,
    });

    const request: TranscribeRequest = {
      type: "transcribe",
      id: requestId,
      audio,
      language,
    };

    console.log(
      "[speechClient] Enviando transcrição:",
      {
        id: requestId,
        samples: audio.length,
        language,
      }
    );

    speechWorker.postMessage(request, [audio.buffer]);
  });
}