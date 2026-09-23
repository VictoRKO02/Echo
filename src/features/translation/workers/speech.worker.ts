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

let transcriber:
  SpeechPipeline | null = null;

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

async function createTranscriber(
  requestId: string
): Promise<SpeechPipeline> {
  console.log(
    "[speech.worker] Criando Whisper..."
  );

  sendStatus(
    requestId,
    "Carregando Whisper..."
  );

  const createdPipeline =
    await createSpeechPipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-base",
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
    );

  transcriber =
    createdPipeline;

  console.log(
    "[speech.worker] Whisper carregado."
  );

  sendStatus(
    requestId,
    "Whisper pronto."
  );

  return createdPipeline;
}

async function getTranscriber(
  requestId: string
): Promise<SpeechPipeline> {
  if (transcriber) {
    return transcriber;
  }

  if (!transcriberPromise) {
    transcriberPromise =
      createTranscriber(
        requestId
      );
  } else {
    sendStatus(
      requestId,
      "Aguardando Whisper..."
    );
  }

  try {
    return await transcriberPromise;
  } catch (error) {
    transcriberPromise =
      null;

    throw error;
  }
}

async function handlePreload(
  request: PreloadRequest
): Promise<void> {
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
  const speechPipeline =
    await getTranscriber(
      request.id
    );

  sendStatus(
    request.id,
    "Executando transcrição..."
  );

  console.log(
    "[speech.worker] Inferência:",
    {
      id: request.id,
      samples:
        request.audio.length,
      language:
        request.language,
    }
  );

  const result =
    await speechPipeline(
      request.audio,
      {
        language:
          request.language,
        task: "transcribe",
      }
    );

  console.log(
    "[speech.worker] Resultado:",
    result
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
    request.type,
    request.id
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

    await handleTranscription(
      request
    );
  } catch (error) {
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
  "[speech.worker] Worker iniciado."
);