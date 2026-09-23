"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import EchoMark, {
  type EchoMarkState,
} from "@/components/EchoMark";

export type LiveAudioEvent = {
  kind:
    | "partial"
    | "final";

  audio:
    Float32Array;

  sampleRate:
    16000;

  utteranceId:
    number;
};

type LiveMicrophoneButtonProps = {
  onAudioEvent: (
    event:
      LiveAudioEvent
  ) => void;

  onRecordingChange?: (
    recording:
      boolean
  ) => void;

  onActivityChange?: (
    activity:
      | "initializing"
      | "listening"
      | "speaking"
      | "stopped"
      | "error"
  ) => void;

  singleUtterance?:
    boolean;
};

type SpeechProbabilities = {
  isSpeech:
    number;

  notSpeech:
    number;
};

type MicVadInstance = {
  start: () =>
    Promise<void> |
    void;

  pause: () =>
    Promise<void> |
    void;

  destroy: () =>
    Promise<void> |
    void;
};

const VAD_SAMPLE_RATE =
  16000;

const PARTIAL_INTERVAL_MS =
  1800;

const PARTIAL_INTERVAL_SAMPLES =
  Math.round(
    VAD_SAMPLE_RATE *
      (
        PARTIAL_INTERVAL_MS /
        1000
      )
  );

function concatenateFrames(
  frames:
    Float32Array[]
): Float32Array {
  const totalLength =
    frames.reduce(
      (
        total,
        frame
      ) =>
        total +
        frame.length,
      0
    );

  const result =
    new Float32Array(
      totalLength
    );

  let offset =
    0;

  for (
    const frame
    of frames
  ) {
    result.set(
      frame,
      offset
    );

    offset +=
      frame.length;
  }

  return result;
}

export default function LiveMicrophoneButton({
  onAudioEvent,
  onRecordingChange,
  onActivityChange,
  singleUtterance = false,
}: LiveMicrophoneButtonProps) {
  const [
    isRecording,
    setIsRecording,
  ] =
    useState(false);

  const [
    isInitializing,
    setIsInitializing,
  ] =
    useState(false);

  const [
    isSpeaking,
    setIsSpeaking,
  ] =
    useState(false);

  const vadRef =
    useRef<MicVadInstance | null>(
      null
    );

  const onAudioEventRef =
    useRef(
      onAudioEvent
    );

  const onRecordingChangeRef =
    useRef(
      onRecordingChange
    );

  const onActivityChangeRef =
    useRef(
      onActivityChange
    );

  const singleUtteranceRef =
    useRef(
      singleUtterance
    );

  const speakingRef =
    useRef(false);

  const speechFramesRef =
    useRef<
      Float32Array[]
    >([]);

  const speechSamplesRef =
    useRef(0);

  const lastPartialSamplesRef =
    useRef(0);

  const utteranceIdRef =
    useRef(0);

  useEffect(() => {
    onAudioEventRef.current =
      onAudioEvent;
  }, [onAudioEvent]);

  useEffect(() => {
    onRecordingChangeRef.current =
      onRecordingChange;
  }, [onRecordingChange]);

  useEffect(() => {
    onActivityChangeRef.current =
      onActivityChange;
  }, [onActivityChange]);

  useEffect(() => {
    singleUtteranceRef.current =
      singleUtterance;
  }, [singleUtterance]);

  function resetSpeechBuffer(): void {
    speechFramesRef.current =
      [];

    speechSamplesRef.current =
      0;

    lastPartialSamplesRef.current =
      0;
  }

  function handleSpeechStart(): void {
    utteranceIdRef.current +=
      1;

    speakingRef.current =
      true;

    setIsSpeaking(
      true
    );

    resetSpeechBuffer();

    onActivityChangeRef.current?.(
      "speaking"
    );
  }

  function handleFrameProcessed(
    probabilities:
      SpeechProbabilities,

    frame:
      Float32Array
  ): void {
    if (
      !speakingRef.current
    ) {
      return;
    }

    const frameCopy =
      new Float32Array(
        frame
      );

    speechFramesRef.current.push(
      frameCopy
    );

    speechSamplesRef.current +=
      frameCopy.length;

    const samplesSincePartial =
      speechSamplesRef.current -
      lastPartialSamplesRef.current;

    if (
      samplesSincePartial <
      PARTIAL_INTERVAL_SAMPLES
    ) {
      return;
    }

    if (
      probabilities.isSpeech <
      0.25
    ) {
      return;
    }

    const partialAudio =
      concatenateFrames(
        speechFramesRef.current
      );

    lastPartialSamplesRef.current =
      speechSamplesRef.current;

    onAudioEventRef.current({
      kind:
        "partial",

      audio:
        partialAudio,

      sampleRate:
        VAD_SAMPLE_RATE,

      utteranceId:
        utteranceIdRef.current,
    });
  }

  async function stopRecording(): Promise<void> {
    const vad =
      vadRef.current;

    if (!vad) {
      return;
    }

    /*
     * Remove a referência antes
     * do await para impedir duas
     * finalizações simultâneas.
     */
    vadRef.current =
      null;

    try {
      await vad.pause();

      await vad.destroy();

      speakingRef.current =
        false;

      setIsSpeaking(
        false
      );

      resetSpeechBuffer();

      setIsRecording(
        false
      );

      onRecordingChangeRef.current?.(
        false
      );

      onActivityChangeRef.current?.(
        "stopped"
      );
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[Echo] Erro ao encerrar:",
        error
      );

      speakingRef.current =
        false;

      setIsSpeaking(
        false
      );

      setIsRecording(
        false
      );

      onRecordingChangeRef.current?.(
        false
      );

      onActivityChangeRef.current?.(
        "error"
      );
    }
  }

  function handleSpeechEnd(
    audio:
      Float32Array
  ): void {
    const currentUtterance =
      utteranceIdRef.current;

    speakingRef.current =
      false;

    setIsSpeaking(
      false
    );

    resetSpeechBuffer();

    /*
     * Entrega a fala completa
     * ao Translator.
     */
    onAudioEventRef.current({
      kind:
        "final",

      audio:
        new Float32Array(
          audio
        ),

      sampleRate:
        VAD_SAMPLE_RATE,

      utteranceId:
        currentUtterance,
    });

    /*
     * Mantemos compatibilidade
     * caso reutilizemos o componente
     * futuramente para captura de
     * uma única fala.
     */
    if (
      singleUtteranceRef.current
    ) {
      window.setTimeout(
        () => {
          void stopRecording();
        },
        0
      );

      return;
    }

    onActivityChangeRef.current?.(
      "listening"
    );
  }

  async function createVad(): Promise<MicVadInstance> {
    const {
      MicVAD,
    } =
      await import(
        "@ricky0123/vad-web"
      );

    const vad =
      await MicVAD.new({
        model:
          "v5",

        baseAssetPath:
          "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",

        onnxWASMBasePath:
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",

        positiveSpeechThreshold:
          0.5,

        negativeSpeechThreshold:
          0.35,

        redemptionMs:
          800,

        preSpeechPadMs:
          300,

        minSpeechMs:
          300,

        submitUserSpeechOnPause:
          false,

        onSpeechStart: () => {
          handleSpeechStart();
        },

        onFrameProcessed: (
          probabilities:
            SpeechProbabilities,

          frame:
            Float32Array
        ) => {
          handleFrameProcessed(
            probabilities,
            frame
          );
        },

        onSpeechEnd: (
          audio:
            Float32Array
        ) => {
          handleSpeechEnd(
            audio
          );
        },

        onVADMisfire: () => {
          speakingRef.current =
            false;

          setIsSpeaking(
            false
          );

          resetSpeechBuffer();

          onActivityChangeRef.current?.(
            "listening"
          );
        },
      });

    return vad;
  }

  async function startRecording(): Promise<void> {
    if (
      isInitializing ||
      isRecording
    ) {
      return;
    }

    try {
      setIsInitializing(
        true
      );

      onActivityChangeRef.current?.(
        "initializing"
      );

      let vad =
        vadRef.current;

      if (!vad) {
        vad =
          await createVad();

        vadRef.current =
          vad;
      }

      await vad.start();

      setIsRecording(
        true
      );

      onRecordingChangeRef.current?.(
        true
      );

      onActivityChangeRef.current?.(
        "listening"
      );
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[Echo] Erro ao iniciar:",
        error
      );

      vadRef.current =
        null;

      speakingRef.current =
        false;

      setIsSpeaking(
        false
      );

      setIsRecording(
        false
      );

      onRecordingChangeRef.current?.(
        false
      );

      onActivityChangeRef.current?.(
        "error"
      );
    } finally {
      setIsInitializing(
        false
      );
    }
  }

  useEffect(() => {
    return () => {
      const vad =
        vadRef.current;

      vadRef.current =
        null;

      if (vad) {
        void vad.destroy();
      }
    };
  }, []);

  async function handleClick(): Promise<void> {
    if (
      isRecording
    ) {
      await stopRecording();

      return;
    }

    await startRecording();
  }

  let markState:
    EchoMarkState =
      "idle";

  if (
    isRecording
  ) {
    markState =
      isSpeaking
        ? "speaking"
        : "listening";
  }

  return (
    <div
      className="
        flex
        flex-col
        items-center
      "
    >
      <button
        type="button"
        onClick={
          handleClick
        }
        disabled={
          isInitializing
        }
        aria-label={
          isRecording
            ? "Encerrar Echo"
            : "Começar a ecoar"
        }
        className="
          group
          relative
          grid
          h-72
          w-72
          place-items-center
          rounded-full
          outline-none
          transition
          duration-500
          hover:scale-[1.025]
          active:scale-[0.975]
          disabled:cursor-wait
          disabled:opacity-60

          sm:h-[21rem]
          sm:w-[21rem]
        "
      >
        {/* HALO GERAL */}

        <span
          className={`
            absolute
            inset-0
            rounded-full
            bg-[radial-gradient(circle,rgba(219,39,119,0.12),rgba(91,33,182,0.035)_45%,transparent_72%)]
            transition
            duration-700
            ${
              isRecording
                ? "opacity-100"
                : "opacity-40 group-hover:opacity-70"
            }
          `}
        />

        {/* ONDA 1 */}

        {isRecording && (
          <span
            className={`
              absolute
              rounded-full
              border
              transition
              duration-500

              ${
                isSpeaking
                  ? "inset-0 border-fuchsia-400/30 animate-ping"
                  : "inset-5 border-fuchsia-400/15 animate-pulse"
              }
            `}
          />
        )}

        {/* ONDA 2 */}

        {isSpeaking && (
          <span
            className="
              absolute
              inset-[-20px]
              rounded-full
              border
              border-violet-400/15
              animate-ping
              [animation-delay:300ms]
            "
          />
        )}

        {/* ONDA 3 */}

        {isSpeaking && (
          <span
            className="
              absolute
              inset-[-42px]
              rounded-full
              border
              border-blue-400/10
              animate-ping
              [animation-delay:600ms]
            "
          />
        )}

        {/* SUPERFÍCIE */}

        <span
          className={`
            absolute
            inset-6
            rounded-full
            border
            bg-[#08090d]
            transition
            duration-500

            ${
              isSpeaking
                ? "border-fuchsia-400/20 shadow-[0_35px_120px_rgba(219,39,119,0.12)]"
                : isRecording
                  ? "border-violet-400/15 shadow-[0_35px_120px_rgba(91,33,182,0.10)]"
                  : "border-white/[0.07] shadow-[0_35px_100px_rgba(0,0,0,0.55)]"
            }
          `}
        />

        {/* SÍMBOLO */}

        <span
          className={`
            relative
            z-10
            transition
            duration-300

            ${
              isSpeaking
                ? "scale-[1.08]"
                : isRecording
                  ? "scale-[1.03]"
                  : "group-hover:scale-105"
            }
          `}
        >
          <EchoMark
            size={220}
            state={
              markState
            }
          />
        </span>
      </button>

      {/* TEXTO */}

      <div
        className="
          mt-4
          text-center
        "
      >
        <p
          className="
            text-xl
            font-medium
            tracking-tight
            text-white
          "
        >
          {isInitializing
            ? "Preparando o Echo..."
            : isSpeaking
              ? "Ecoando sua voz"
              : isRecording
                ? "Echo está ouvindo"
                : "Começar a ecoar"}
        </p>

        <p
          className="
            mt-2
            min-h-5
            text-sm
            text-zinc-600
          "
        >
          {isInitializing
            ? "Preparando reconhecimento de voz."
            : isSpeaking
              ? "Continue falando normalmente."
              : isRecording
                ? "O Echo continuará ouvindo até você encerrar."
                : "Um toque. O Echo cuida do resto."}
        </p>
      </div>
    </div>
  );
}