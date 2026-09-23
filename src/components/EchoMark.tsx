import { useId } from "react";

export type EchoMarkState =
  | "idle"
  | "listening"
  | "speaking";

type EchoMarkProps = {
  size?: number;
  state?: EchoMarkState;
  className?: string;
};

export default function EchoMark({
  size = 96,
  state = "idle",
  className = "",
}: EchoMarkProps) {
  const rawGradientId =
    useId();

  const gradientId =
    rawGradientId.replace(
      /:/g,
      ""
    );

  const isActive =
    state !== "idle";

  const isSpeaking =
    state === "speaking";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`
        overflow-visible
        ${className}
      `}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="12"
          y1="12"
          x2="88"
          y2="88"
          gradientUnits="userSpaceOnUse"
        >
          <stop
            offset="0%"
            stopColor="#FF9417"
          />

          <stop
            offset="30%"
            stopColor="#FF316D"
          />

          <stop
            offset="65%"
            stopColor="#D126D9"
          />

          <stop
            offset="100%"
            stopColor="#536DFF"
          />
        </linearGradient>

        <filter
          id={`${gradientId}-glow`}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur
            stdDeviation={
              isSpeaking
                ? "2.4"
                : "1.4"
            }
            result="blur"
          />

          <feMerge>
            <feMergeNode
              in="blur"
            />

            <feMergeNode
              in="SourceGraphic"
            />
          </feMerge>
        </filter>
      </defs>

      {isActive && (
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke={`url(#${gradientId})`}
          strokeWidth="0.8"
          opacity={
            isSpeaking
              ? "0.3"
              : "0.16"
          }
        />
      )}

      <g
        filter={
          isActive
            ? `url(#${gradientId}-glow)`
            : undefined
        }
      >
        <path
          d="
            M 77 22
            A 37 37
            0 1 0
            77 78
          "
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
          strokeLinecap="round"
        />

        <path
          d="M 34 50 H 69"
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}