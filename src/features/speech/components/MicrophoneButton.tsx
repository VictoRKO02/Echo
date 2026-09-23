"use client";

import { useRef, useState } from "react";

type MicrophoneButtonProps = {
  onAudioReady: (
    audio: Float32Array,
    sampleRate: number
  ) => void;
};

export default function MicrophoneButton({
  onAudioReady,
}: MicrophoneButtonProps) {
  const [isRecording, setIsRecording] =
    useState(false);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const processorRef =
    useRef<ScriptProcessorNode | null>(null);

  const sourceRef =
    useRef<MediaStreamAudioSourceNode | null>(null);

  const gainRef =
    useRef<GainNode | null>(null);

  const audioChunksRef =
    useRef<Float32Array[]>([]);

  async function startRecording() {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      const audioContext =
        new AudioContext();

      await audioContext.resume();

      const source =
        audioContext.createMediaStreamSource(
          stream
        );

      const processor =
        audioContext.createScriptProcessor(
          4096,
          1,
          1
        );

      const gain =
        audioContext.createGain();

      gain.gain.value = 0;

      audioChunksRef.current = [];

      processor.onaudioprocess = (
        event
      ) => {
        const channelData =
          event.inputBuffer.getChannelData(0);

        audioChunksRef.current.push(
          new Float32Array(channelData)
        );
      };

      source.connect(processor);

      processor.connect(gain);

      gain.connect(
        audioContext.destination
      );

      streamRef.current =
        stream;

      audioContextRef.current =
        audioContext;

      processorRef.current =
        processor;

      sourceRef.current =
        source;

      gainRef.current =
        gain;

      setIsRecording(true);
    } catch (error) {
      console.error(
        "Erro ao iniciar gravação:",
        error
      );
    }
  }

  async function stopRecording() {
    const audioContext =
      audioContextRef.current;

    const stream =
      streamRef.current;

    const processor =
      processorRef.current;

    const source =
      sourceRef.current;

    const gain =
      gainRef.current;

    if (!audioContext) {
      return;
    }

    processor?.disconnect();

    source?.disconnect();

    gain?.disconnect();

    stream
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    const chunks =
      audioChunksRef.current;

    const totalLength =
      chunks.reduce(
        (total, chunk) =>
          total + chunk.length,
        0
      );

    const audio =
      new Float32Array(totalLength);

    let offset = 0;

    for (const chunk of chunks) {
      audio.set(
        chunk,
        offset
      );

      offset +=
        chunk.length;
    }

    const sampleRate =
      audioContext.sampleRate;

    await audioContext.close();

    audioContextRef.current =
      null;

    streamRef.current =
      null;

    processorRef.current =
      null;

    sourceRef.current =
      null;

    gainRef.current =
      null;

    audioChunksRef.current =
      [];

    setIsRecording(false);

    console.log(
      "Áudio PCM capturado:",
      {
        samples: audio.length,
        sampleRate,
        duration:
          audio.length /
          sampleRate,
      }
    );

    onAudioReady(
      audio,
      sampleRate
    );
  }

  async function handleClick() {
    if (isRecording) {
      await stopRecording();
      return;
    }

    await startRecording();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-900"
    >
      {isRecording
        ? "Parar gravação"
        : "Usar microfone"}
    </button>
  );
}