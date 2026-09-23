/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class EchoLiveProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const chunkDurationMs =
      options.processorOptions
        ?.chunkDurationMs ?? 4000;

    const overlapDurationMs =
      options.processorOptions
        ?.overlapDurationMs ?? 1000;

    this.chunkSize =
      Math.floor(
        sampleRate *
          (chunkDurationMs / 1000)
      );

    this.overlapSize =
      Math.floor(
        sampleRate *
          (overlapDurationMs / 1000)
      );

    this.buffer =
      new Float32Array(
        this.chunkSize
      );

    this.offset = 0;

    /*
     * Indica se, depois do último
     * chunk, entrou áudio novo.
     *
     * Isso evita reenviar apenas
     * o overlap quando encerramos.
     */
    this.hasNewAudio = false;

    this.port.onmessage = (
      event
    ) => {
      if (
        event.data?.type ===
        "flush"
      ) {
        this.flush();

        this.port.postMessage({
          type: "flushed",
        });
      }
    };
  }

  sendChunk(audio) {
    this.port.postMessage(
      {
        type: "chunk",
        audio,
      },
      [audio.buffer]
    );
  }

  calculateRms(audio) {
    if (
      audio.length === 0
    ) {
      return 0;
    }

    let sum = 0;

    for (
      let index = 0;
      index < audio.length;
      index++
    ) {
      const sample =
        audio[index];

      sum +=
        sample * sample;
    }

    return Math.sqrt(
      sum / audio.length
    );
  }

  shouldSendChunk(audio) {
    const rms =
      this.calculateRms(
        audio
      );

    return rms > 0.008;
  }

  emitCurrentChunk() {
    const completedChunk =
      new Float32Array(
        this.buffer
      );

    if (
      this.shouldSendChunk(
        completedChunk
      )
    ) {
      this.sendChunk(
        completedChunk
      );
    }

    /*
     * Guardamos o último segundo
     * para servir de contexto para
     * a próxima janela.
     */
    const overlap =
      this.buffer.slice(
        this.chunkSize -
          this.overlapSize
      );

    this.buffer =
      new Float32Array(
        this.chunkSize
      );

    this.buffer.set(
      overlap,
      0
    );

    this.offset =
      this.overlapSize;

    /*
     * Nesse momento temos somente
     * áudio antigo no buffer.
     */
    this.hasNewAudio =
      false;
  }

  flush() {
    /*
     * Se não entrou áudio novo
     * depois do último chunk,
     * não reenviamos só o overlap.
     */
    if (
      !this.hasNewAudio
    ) {
      this.buffer =
        new Float32Array(
          this.chunkSize
        );

      this.offset = 0;

      return;
    }

    const remainingAudio =
      this.buffer.slice(
        0,
        this.offset
      );

    if (
      this.shouldSendChunk(
        remainingAudio
      )
    ) {
      this.sendChunk(
        remainingAudio
      );
    }

    this.buffer =
      new Float32Array(
        this.chunkSize
      );

    this.offset = 0;

    this.hasNewAudio =
      false;
  }

  process(inputs) {
    const input =
      inputs[0];

    if (
      !input ||
      input.length === 0
    ) {
      return true;
    }

    const channel =
      input[0];

    if (!channel) {
      return true;
    }

    let inputOffset = 0;

    while (
      inputOffset <
      channel.length
    ) {
      const availableSpace =
        this.chunkSize -
        this.offset;

      const availableInput =
        channel.length -
        inputOffset;

      const amountToCopy =
        Math.min(
          availableSpace,
          availableInput
        );

      this.buffer.set(
        channel.subarray(
          inputOffset,
          inputOffset +
            amountToCopy
        ),
        this.offset
      );

      this.offset +=
        amountToCopy;

      inputOffset +=
        amountToCopy;

      if (
        amountToCopy > 0
      ) {
        this.hasNewAudio =
          true;
      }

      if (
        this.offset ===
        this.chunkSize
      ) {
        this.emitCurrentChunk();
      }
    }

    return true;
  }
}

registerProcessor(
  "echo-live-processor",
  EchoLiveProcessor
);