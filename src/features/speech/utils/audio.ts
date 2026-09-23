const WHISPER_SAMPLE_RATE =
  16000;

export function prepareAudioForWhisper(
  audio: Float32Array,
  originalSampleRate: number
): Float32Array {
  if (
    originalSampleRate ===
    WHISPER_SAMPLE_RATE
  ) {
    return audio;
  }

  return resampleAudio(
    audio,
    originalSampleRate,
    WHISPER_SAMPLE_RATE
  );
}

function resampleAudio(
  audio: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number
): Float32Array {
  const ratio =
    originalSampleRate /
    targetSampleRate;

  const newLength =
    Math.round(
      audio.length /
        ratio
    );

  const result =
    new Float32Array(
      newLength
    );

  for (
    let index = 0;
    index < newLength;
    index++
  ) {
    const originalIndex =
      index * ratio;

    const lowerIndex =
      Math.floor(
        originalIndex
      );

    const upperIndex =
      Math.min(
        lowerIndex + 1,
        audio.length - 1
      );

    const interpolation =
      originalIndex -
      lowerIndex;

    const lowerValue =
      audio[lowerIndex];

    const upperValue =
      audio[upperIndex];

    result[index] =
      lowerValue *
        (1 - interpolation) +
      upperValue *
        interpolation;
  }

  return result;
}