"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import LiveMicrophoneButton, {
  type LiveAudioEvent,
} from "@/features/speech/components/LiveMicrophoneButton";

import {
  preloadSpeechModel,
  subscribeSpeechStatus,
  transcribeAudio,
} from "@/features/speech/services/speechClient";

import {
  preloadLiveTranslationModel,
  supportsFastLiveTranslation,
  translateLiveText,
} from "@/features/translation/services/liveTranslationClient";

import {
  translateText,
} from "@/features/translation/services/translationClient";

type LiveJob =
  LiveAudioEvent & {
    sessionId: number;
    sourceLanguage: string;
    targetLanguage: string;
  };

type Language = {
  code: string;
  short: string;
  name: string;
};

const LANGUAGES: Language[] = [
  {
    code: "pt",
    short: "PT",
    name: "Português",
  },
  {
    code: "en",
    short: "EN",
    name: "English",
  },
  {
    code: "es",
    short: "ES",
    name: "Español",
  },
  {
    code: "fr",
    short: "FR",
    name: "Français",
  },
];

function appendText(
  previous: string,
  next: string
): string {
  const cleanPrevious =
    previous.trim();

  const cleanNext =
    next.trim();

  if (!cleanNext) {
    return cleanPrevious;
  }

  if (!cleanPrevious) {
    return cleanNext;
  }

  return `${cleanPrevious} ${cleanNext}`;
}

function getLanguageName(
  code: string
): string {
  return (
    LANGUAGES.find(
      (language) =>
        language.code === code
    )?.name ?? code
  );
}

function getLanguageShort(
  code: string
): string {
  return (
    LANGUAGES.find(
      (language) =>
        language.code === code
    )?.short ??
    code.toUpperCase()
  );
}

export default function Translator() {
  const [
    inputText,
    setInputText,
  ] =
    useState("");

  const [
    outputText,
    setOutputText,
  ] =
    useState("");

  const [
    sourceLanguage,
    setSourceLanguage,
  ] =
    useState("pt");

  const [
    targetLanguage,
    setTargetLanguage,
  ] =
    useState("en");

  const [
    isListening,
    setIsListening,
  ] =
    useState(false);

  const [
    isSpeaking,
    setIsSpeaking,
  ] =
    useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] =
    useState(
      "Echo pronto."
    );

  const [
    asrMs,
    setAsrMs,
  ] =
    useState<number | null>(
      null
    );

  const [
    translationMs,
    setTranslationMs,
  ] =
    useState<number | null>(
      null
    );

  const [
    totalMs,
    setTotalMs,
  ] =
    useState<number | null>(
      null
    );

  /*
   * Texto que já foi confirmado
   * pelo VAD.
   */
  const finalSourceRef =
    useRef("");

  const finalTargetRef =
    useRef("");

  /*
   * Texto parcial da fala atual.
   */
  const partialSourceRef =
    useRef("");

  const partialUtteranceRef =
    useRef<number | null>(
      null
    );

  /*
   * Resultado final nunca é
   * descartado.
   */
  const finalJobsRef =
    useRef<LiveJob[]>(
      []
    );

  /*
   * Para parcial guardamos somente
   * o resultado mais recente.
   */
  const latestPartialJobRef =
    useRef<LiveJob | null>(
      null
    );

  const processorBusyRef =
    useRef(false);

  const listeningRef =
    useRef(false);

  const speakingRef =
    useRef(false);

  const sessionRef =
    useRef(0);

  /*
   * Carrega o Whisper ao abrir o Echo.
   */
  useEffect(() => {
    const unsubscribe =
      subscribeSpeechStatus(
        (
          status: string
        ) => {
          if (
            !listeningRef.current
          ) {
            setStatusMessage(
              status
            );
          }
        }
      );

    preloadSpeechModel()
      .catch(
        (
          error: unknown
        ) => {
          console.error(
            "Erro ao carregar Whisper:",
            error
          );

          setStatusMessage(
            "Não foi possível preparar o reconhecimento de voz."
          );
        }
      );

    return unsubscribe;
  }, []);

  /*
   * Carrega antecipadamente o
   * tradutor rápido quando houver
   * suporte para o par selecionado.
   */
  useEffect(() => {
    if (
      !supportsFastLiveTranslation(
        sourceLanguage,
        targetLanguage
      )
    ) {
      return;
    }

    preloadLiveTranslationModel()
      .catch(
        (
          error: unknown
        ) => {
          console.error(
            "Erro ao carregar tradutor rápido:",
            error
          );
        }
      );
  }, [
    sourceLanguage,
    targetLanguage,
  ]);

  async function translateForEcho(
    text: string,
    source: string,
    target: string
  ): Promise<string> {
    if (
      supportsFastLiveTranslation(
        source,
        target
      )
    ) {
      return translateLiveText(
        text
      );
    }

    /*
     * Outros pares continuam
     * utilizando o NLLB universal.
     */
    return translateText(
      text,
      source,
      target
    );
  }

  function hasFinalWaitingForUtterance(
    utteranceId: number
  ): boolean {
    return finalJobsRef.current.some(
      (job) =>
        job.utteranceId ===
        utteranceId
    );
  }

  function hasNewerPartial(
    job: LiveJob
  ): boolean {
    const latest =
      latestPartialJobRef.current;

    return Boolean(
      latest &&
        latest.sessionId ===
          job.sessionId &&
        latest.utteranceId ===
          job.utteranceId
    );
  }

  function refreshDisplay(): void {
    setInputText(
      appendText(
        finalSourceRef.current,
        partialSourceRef.current
      )
    );

    setOutputText(
      finalTargetRef.current
    );
  }

  /*
   * RESULTADO PARCIAL
   *
   * Mostramos rapidamente o que
   * Whisper está entendendo enquanto
   * a pessoa ainda está falando.
   *
   * Não traduzimos parcial.
   */
  async function processPartialJob(
    job: LiveJob
  ): Promise<void> {
    if (
      job.sessionId !==
      sessionRef.current
    ) {
      return;
    }

    const startedAt =
      performance.now();

    const transcription =
      await transcribeAudio(
        job.audio,
        job.sampleRate,
        job.sourceLanguage
      );

    const elapsed =
      Math.round(
        performance.now() -
          startedAt
      );

    setAsrMs(
      elapsed
    );

    /*
     * O resultado pode ter ficado
     * velho enquanto o Whisper
     * trabalhava.
     */
    if (
      job.sessionId !==
        sessionRef.current ||
      hasFinalWaitingForUtterance(
        job.utteranceId
      ) ||
      hasNewerPartial(
        job
      )
    ) {
      return;
    }

    const text =
      transcription.trim();

    if (!text) {
      return;
    }

    partialSourceRef.current =
      text;

    partialUtteranceRef.current =
      job.utteranceId;

    refreshDisplay();
  }

  /*
   * RESULTADO FINAL
   *
   * Depois que o VAD detecta
   * uma pausa:
   *
   * áudio
   * ↓
   * Whisper final
   * ↓
   * tradução
   * ↓
   * histórico
   */
  async function processFinalJob(
    job: LiveJob
  ): Promise<void> {
    if (
      job.sessionId !==
      sessionRef.current
    ) {
      return;
    }

    const totalStartedAt =
      performance.now();

    setStatusMessage(
      "Finalizando fala..."
    );

    /*
     * WHISPER
     */

    const asrStartedAt =
      performance.now();

    const transcription =
      await transcribeAudio(
        job.audio,
        job.sampleRate,
        job.sourceLanguage
      );

    const asrElapsed =
      Math.round(
        performance.now() -
          asrStartedAt
      );

    setAsrMs(
      asrElapsed
    );

    if (
      job.sessionId !==
      sessionRef.current
    ) {
      return;
    }

    const cleanTranscription =
      transcription.trim();

    if (
      !cleanTranscription
    ) {
      return;
    }

    /*
     * O parcial daquela frase já
     * pode desaparecer porque agora
     * temos a versão definitiva.
     */
    if (
      partialUtteranceRef.current ===
      job.utteranceId
    ) {
      partialSourceRef.current =
        "";

      partialUtteranceRef.current =
        null;
    }

    /*
     * TRADUÇÃO
     */

    setStatusMessage(
      "Traduzindo..."
    );

    const translationStartedAt =
      performance.now();

    const translation =
      await translateForEcho(
        cleanTranscription,
        job.sourceLanguage,
        job.targetLanguage
      );

    const translationElapsed =
      Math.round(
        performance.now() -
          translationStartedAt
      );

    setTranslationMs(
      translationElapsed
    );

    if (
      job.sessionId !==
      sessionRef.current
    ) {
      return;
    }

    /*
     * Como agora existe apenas o
     * Echo contínuo, cada nova fala
     * entra no histórico.
     */
    finalSourceRef.current =
      appendText(
        finalSourceRef.current,
        cleanTranscription
      );

    finalTargetRef.current =
      appendText(
        finalTargetRef.current,
        translation.trim()
      );

    refreshDisplay();

    const totalElapsed =
      Math.round(
        performance.now() -
          totalStartedAt
      );

    setTotalMs(
      totalElapsed
    );

    console.log(
      "[Echo] Fala processada:",
      {
        asrMs:
          asrElapsed,

        translationMs:
          translationElapsed,

        totalMs:
          totalElapsed,

        transcription:
          cleanTranscription,

        translation,
      }
    );

    if (
      listeningRef.current
    ) {
      setStatusMessage(
        speakingRef.current
          ? "Falando"
          : "Ouvindo"
      );
    }
  }

  /*
   * FILA DE PROCESSAMENTO
   */

  async function processJobs(): Promise<void> {
    if (
      processorBusyRef.current
    ) {
      return;
    }

    processorBusyRef.current =
      true;

    try {
      while (true) {
        /*
         * Final sempre tem prioridade.
         */
        const finalJob =
          finalJobsRef.current.shift();

        if (
          finalJob
        ) {
          try {
            await processFinalJob(
              finalJob
            );
          } catch (
            error: unknown
          ) {
            console.error(
              "[Echo] Erro ao processar fala:",
              error
            );

            setStatusMessage(
              "Não foi possível processar essa fala."
            );
          }

          continue;
        }

        /*
         * Parcial:
         * somente o mais recente
         * interessa.
         */
        const partialJob =
          latestPartialJobRef.current;

        latestPartialJobRef.current =
          null;

        if (
          !partialJob
        ) {
          break;
        }

        try {
          await processPartialJob(
            partialJob
          );
        } catch (
          error: unknown
        ) {
          console.error(
            "[Echo] Erro no resultado parcial:",
            error
          );
        }
      }
    } finally {
      processorBusyRef.current =
        false;

      /*
       * Pode ter chegado algum evento
       * exatamente enquanto o loop
       * estava terminando.
       */
      if (
        finalJobsRef.current.length >
          0 ||
        latestPartialJobRef.current
      ) {
        void processJobs();

        return;
      }

      if (
        listeningRef.current
      ) {
        setStatusMessage(
          speakingRef.current
            ? "Falando"
            : "Ouvindo"
        );
      } else {
        setStatusMessage(
          "Echo pronto."
        );
      }
    }
  }

  function handleAudioEvent(
    event: LiveAudioEvent
  ): void {
    const job: LiveJob = {
      ...event,

      sourceLanguage,
      targetLanguage,

      sessionId:
        sessionRef.current,
    };

    if (
      event.kind ===
      "final"
    ) {
      /*
       * Quando o final chegou,
       * qualquer parcial pendente
       * dessa fala perdeu o valor.
       */
      if (
        latestPartialJobRef.current
          ?.utteranceId ===
        event.utteranceId
      ) {
        latestPartialJobRef.current =
          null;
      }

      finalJobsRef.current.push(
        job
      );
    } else {
      latestPartialJobRef.current =
        job;
    }

    void processJobs();
  }

  function resetSession(): void {
    finalJobsRef.current =
      [];

    latestPartialJobRef.current =
      null;

    finalSourceRef.current =
      "";

    finalTargetRef.current =
      "";

    partialSourceRef.current =
      "";

    partialUtteranceRef.current =
      null;

    setInputText(
      ""
    );

    setOutputText(
      ""
    );

    setAsrMs(
      null
    );

    setTranslationMs(
      null
    );

    setTotalMs(
      null
    );
  }

  function handleRecordingChange(
    recording: boolean
  ): void {
    listeningRef.current =
      recording;

    setIsListening(
      recording
    );

    if (
      recording
    ) {
      sessionRef.current +=
        1;

      resetSession();

      setStatusMessage(
        "Ouvindo"
      );

      return;
    }

    if (
      processorBusyRef.current ||
      finalJobsRef.current.length >
        0
    ) {
      setStatusMessage(
        "Finalizando última fala..."
      );

      return;
    }

    setStatusMessage(
      "Echo pronto."
    );
  }

  function handleActivityChange(
    activity:
      | "initializing"
      | "listening"
      | "speaking"
      | "stopped"
      | "error"
  ): void {
    if (
      activity ===
      "initializing"
    ) {
      setStatusMessage(
        "Preparando Echo..."
      );

      return;
    }

    if (
      activity ===
      "speaking"
    ) {
      speakingRef.current =
        true;

      setIsSpeaking(
        true
      );

      setStatusMessage(
        "Falando"
      );

      return;
    }

    if (
      activity ===
      "listening"
    ) {
      speakingRef.current =
        false;

      setIsSpeaking(
        false
      );

      setStatusMessage(
        "Ouvindo"
      );

      return;
    }

    if (
      activity ===
      "error"
    ) {
      speakingRef.current =
        false;

      setIsSpeaking(
        false
      );

      setStatusMessage(
        "Não foi possível iniciar o Echo."
      );

      return;
    }

    speakingRef.current =
      false;

    setIsSpeaking(
      false
    );
  }

  return (
    <div
      className="
        w-full
        pt-2
      "
    >
      {/* AÇÃO PRINCIPAL */}

      <section
        className="
          mb-10
          flex
          justify-center
        "
      >
        <LiveMicrophoneButton
          onAudioEvent={
            handleAudioEvent
          }
          onRecordingChange={
            handleRecordingChange
          }
          onActivityChange={
            handleActivityChange
          }
        />
      </section>

      {/* IDIOMAS */}

      <section
        className="
          mx-auto
          mb-5
          grid
          max-w-5xl
          gap-3
          sm:grid-cols-[1fr_auto_1fr]
          sm:items-end
        "
      >
        <label>
          <span
            className="
              mb-2
              block
              text-[10px]
              uppercase
              tracking-[0.25em]
              text-zinc-700
            "
          >
            De
          </span>

          <select
            value={
              sourceLanguage
            }
            disabled={
              isListening
            }
            onChange={(
              event
            ) =>
              setSourceLanguage(
                event.target.value
              )
            }
            className="
              h-14
              w-full
              rounded-2xl
              border
              border-white/[0.07]
              bg-[#0d0e12]
              px-5
              text-sm
              text-white
              outline-none
              transition
              focus:border-fuchsia-500/30
              disabled:opacity-60
            "
          >
            {LANGUAGES.map(
              (
                language
              ) => (
                <option
                  key={
                    language.code
                  }
                  value={
                    language.code
                  }
                  className="bg-zinc-950"
                >
                  {
                    language.short
                  }{" "}
                  ·{" "}
                  {
                    language.name
                  }
                </option>
              )
            )}
          </select>
        </label>

        <div
          className="
            hidden
            h-14
            items-center
            px-3
            text-zinc-700
            sm:flex
          "
        >
          →
        </div>

        <label>
          <span
            className="
              mb-2
              block
              text-[10px]
              uppercase
              tracking-[0.25em]
              text-zinc-700
            "
          >
            Para
          </span>

          <select
            value={
              targetLanguage
            }
            disabled={
              isListening
            }
            onChange={(
              event
            ) =>
              setTargetLanguage(
                event.target.value
              )
            }
            className="
              h-14
              w-full
              rounded-2xl
              border
              border-white/[0.07]
              bg-[#0d0e12]
              px-5
              text-sm
              text-white
              outline-none
              transition
              focus:border-violet-500/30
              disabled:opacity-60
            "
          >
            {LANGUAGES.map(
              (
                language
              ) => (
                <option
                  key={
                    language.code
                  }
                  value={
                    language.code
                  }
                  className="bg-zinc-950"
                >
                  {
                    language.short
                  }{" "}
                  ·{" "}
                  {
                    language.name
                  }
                </option>
              )
            )}
          </select>
        </label>
      </section>

      {/* ORIGINAL + TRADUÇÃO */}

      <section
        className="
          mx-auto
          max-w-5xl
          rounded-[28px]
          border
          border-white/[0.07]
          bg-[#0a0b0e]
          p-5
          shadow-[0_35px_100px_rgba(0,0,0,0.35)]
          sm:p-6
        "
      >
        <div
          className="
            mb-5
            flex
            items-center
            justify-between
          "
        >
          <p
            className="
              text-[10px]
              uppercase
              tracking-[0.25em]
              text-zinc-700
            "
          >
            Echo
          </p>

          {isListening && (
            <div
              className="
                flex
                items-center
                gap-2
                text-xs
                text-emerald-400
              "
            >
              <span
                className="
                  h-1.5
                  w-1.5
                  rounded-full
                  bg-emerald-400
                  animate-pulse
                "
              />

              Ao vivo
            </div>
          )}
        </div>

        <div
          className="
            grid
            overflow-hidden
            rounded-2xl
            border
            border-white/[0.06]
            bg-[#07080b]

            md:grid-cols-[1fr_auto_1fr]
          "
        >
          {/* ORIGINAL */}

          <div
            className="
              min-w-0
              p-6
              sm:p-7
            "
          >
            <div
              className="
                mb-5
                flex
                items-center
                gap-3
              "
            >
              <span
                className="
                  grid
                  h-8
                  min-w-8
                  place-items-center
                  rounded-full
                  bg-white/[0.05]
                  px-2
                  text-[10px]
                  text-zinc-500
                "
              >
                {getLanguageShort(
                  sourceLanguage
                )}
              </span>

              <span
                className="
                  text-xs
                  text-zinc-600
                "
              >
                {getLanguageName(
                  sourceLanguage
                )}
              </span>
            </div>

            <p
              className="
                min-h-32
                whitespace-pre-wrap
                break-words
                text-lg
                leading-relaxed
                text-zinc-300
                sm:text-xl
              "
            >
              {inputText ||
                "Sua fala aparecerá aqui..."}
            </p>
          </div>

          {/* DIVISÓRIA */}

          <div
            className="
              mx-6
              h-px
              bg-gradient-to-r
              from-transparent
              via-fuchsia-500/30
              to-transparent

              md:mx-0
              md:my-6
              md:h-auto
              md:w-px
              md:bg-gradient-to-b
              md:from-transparent
              md:via-fuchsia-500/30
              md:to-transparent
            "
          />

          {/* TRADUÇÃO */}

          <div
            className="
              min-w-0
              p-6
              sm:p-7
            "
          >
            <div
              className="
                mb-5
                flex
                items-center
                gap-3
              "
            >
              <span
                className="
                  grid
                  h-8
                  min-w-8
                  place-items-center
                  rounded-full
                  bg-violet-500/10
                  px-2
                  text-[10px]
                  text-violet-300
                "
              >
                {getLanguageShort(
                  targetLanguage
                )}
              </span>

              <span
                className="
                  text-xs
                  text-violet-300
                "
              >
                {getLanguageName(
                  targetLanguage
                )}
              </span>
            </div>

            <p
              className="
                min-h-32
                whitespace-pre-wrap
                break-words
                text-xl
                font-medium
                leading-relaxed
                text-white
                sm:text-2xl
              "
            >
              {outputText ||
                "A tradução aparecerá aqui."}
            </p>
          </div>
        </div>

        {/* STATUS */}

        <div
          className="
            mt-5
            flex
            flex-wrap
            items-center
            justify-between
            gap-4
          "
        >
          <div
            className="
              flex
              items-center
              gap-2
              text-xs
              text-zinc-600
            "
          >
            <span
              className={`
                h-2
                w-2
                rounded-full
                ${
                  isListening
                    ? isSpeaking
                      ? "bg-fuchsia-400"
                      : "bg-emerald-400"
                    : "bg-zinc-800"
                }
              `}
            />

            {
              statusMessage
            }
          </div>

          {totalMs !==
            null && (
            <span
              className="
                rounded-full
                border
                border-white/[0.06]
                px-3
                py-1.5
                text-xs
                text-zinc-600
              "
            >
              ~{" "}
              {(
                totalMs /
                1000
              ).toFixed(
                1
              )}{" "}
              s
            </span>
          )}
        </div>

        {/* DIAGNÓSTICO */}

        <details
          className="
            mt-4
            text-[11px]
            text-zinc-700
          "
        >
          <summary
            className="
              cursor-pointer
              select-none
              transition
              hover:text-zinc-500
            "
          >
            Diagnóstico
          </summary>

          <div
            className="
              mt-3
              flex
              flex-wrap
              gap-5
            "
          >
            <span>
              VAD:{" "}
              {isSpeaking
                ? "fala"
                : isListening
                  ? "silêncio"
                  : "parado"}
            </span>

            <span>
              Whisper:{" "}
              {asrMs ===
              null
                ? "-"
                : `${asrMs} ms`}
            </span>

            <span>
              Tradução:{" "}
              {translationMs ===
              null
                ? "-"
                : `${translationMs} ms`}
            </span>

            <span>
              Total:{" "}
              {totalMs ===
              null
                ? "-"
                : `${totalMs} ms`}
            </span>
          </div>
        </details>
      </section>

      <footer
        className="
          mt-7
          text-center
          text-[11px]
          text-zinc-800
        "
      >
        Processamento local · Privado por padrão
      </footer>
    </div>
  );
}