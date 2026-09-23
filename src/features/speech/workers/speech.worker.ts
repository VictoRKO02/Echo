import { pipeline } from "@huggingface/transformers";

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

type SpeechWorkerRequest =
  | PreloadRequest
  | TranscribeRequest;

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

type SpeechResult = {
  text: string;
};

type SpeechPipelineOptions = {
  language: string;
  task: "transcribe";
};

type SpeechPipeline = (
  audio: Float32Array,
  options: SpeechPipelineOptions
) => Promise<SpeechResult>;

type ProgressInfo = {
  progress?: number;
  status?: string;
  file?: string;
};

type PipelineCreationOptions = {
  dtype: "q8";
  device: "wasm";

  progress_callback?: (
    info: ProgressInfo
  ) => void;
};

type CreateSpeechPipeline = (
  task: "automatic-speech-recognition",
  model: string,
  options: PipelineCreationOptions
) => Promise<SpeechPipeline>;

const createSpeechPipeline =
  pipeline as unknown as CreateSpeechPipeline;

let transcriber: SpeechPipeline | null = null;

let transcriberPromise:
  Promise<SpeechPipeline> | null = null;

function sendStatus(
  id: string,
  status: string
): void {
  const response: SpeechWorkerResponse = {
    type: "status",
    id,
    status,
  };

  self.postMessage(response);
}

function sendProgress(
  id: string,
  progress: number
): void {
  const response: SpeechWorkerResponse = {
    type: "progress",
    id,
    progress,
  };

  self.postMessage(response);
}

function getTranscriber(
  requestId: string
): Promise<SpeechPipeline> {
  if (transcriber) {
    return Promise.resolve(
      transcriber
    );
  }

  if (transcriberPromise) {
    sendStatus(
      requestId,
      "Aguardando Whisper..."
    );

    return transcriberPromise;
  }

  console.log(
    "[speech.worker] Iniciando carregamento do Whisper."
  );

  sendStatus(
    requestId,
    "Carregando Whisper..."
  );

  transcriberPromise =
    createSpeechPipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
      {
        dtype: "q8",
        device: "wasm",

        progress_callback: (
          progressInfo
        ) => {
          console.log(
            "[speech.worker] Progresso:",
            progressInfo
          );

          if (
            typeof progressInfo.progress ===
            "number"
          ) {
            sendProgress(
              requestId,
              progressInfo.progress
            );
          }
        },
      }
    )
      .then(
        (createdTranscriber) => {
          transcriber =
            createdTranscriber;

          console.log(
            "[speech.worker] Whisper carregado."
          );

          sendStatus(
            requestId,
            "Whisper pronto."
          );

          return createdTranscriber;
        }
      )
      .catch((error: unknown) => {
        transcriberPromise =
          null;

        throw error;
      });

  return transcriberPromise;
}

async function handlePreload(
  request: PreloadRequest
): Promise<void> {
  console.log(
    "[speech.worker] Preload recebido:",
    request.id
  );

  // IMPORTANTE:
  // Aqui apenas carregamos o modelo.
  // NÃO chamamos o Whisper com áudio.
  await getTranscriber(
    request.id
  );

  const response: SpeechWorkerResponse = {
    type: "ready",
    id: request.id,
  };

  self.postMessage(
    response
  );
}

async function handleTranscription(
  request: TranscribeRequest
): Promise<void> {
  console.log(
    "[speech.worker] Transcrição recebida:",
    {
      id: request.id,
      language:
        request.language,
      samples:
        request.audio?.length,
    }
  );

  if (
    !request.audio ||
    !(request.audio instanceof Float32Array) ||
    request.audio.length === 0
  ) {
    throw new Error(
      "O Worker recebeu uma requisição de transcrição sem áudio válido."
    );
  }

  const speechPipeline =
    await getTranscriber(
      request.id
    );

  sendStatus(
    request.id,
    "Executando transcrição..."
  );

  const startTime =
    performance.now();

  const result =
    await speechPipeline(
      request.audio,
      {
        language:
          request.language,
        task: "transcribe",
      }
    );

  const elapsed =
    performance.now() -
    startTime;

  console.log(
    "[speech.worker] Transcrição concluída:",
    {
      milliseconds:
        Math.round(elapsed),
      text:
        result.text,
    }
  );

  const response: SpeechWorkerResponse = {
    type: "result",
    id: request.id,
    text: result.text,
  };

  self.postMessage(
    response
  );
}

self.onmessage = async (
  event: MessageEvent<SpeechWorkerRequest>
) => {
  const request =
    event.data;

  console.log(
    "[speech.worker] Mensagem recebida:",
    {
      type:
        request.type,
      id:
        request.id,
    }
  );

  try {
    if (
      request.type ===
      "preload"
    ) {
      await handlePreload(
        request
      );

      return;
    }

    if (
      request.type ===
      "transcribe"
    ) {
      await handleTranscription(
        request
      );

      return;
    }

    throw new Error(
      "Tipo de mensagem desconhecido."
    );
  } catch (error: unknown) {
    console.error(
      "[speech.worker] Erro:",
      error
    );

    const response: SpeechWorkerResponse = {
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

console.log(
  "[speech.worker] Worker inicializado."
);