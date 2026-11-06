import type { CSSProperties } from "react";
import type { CardState } from "../../lib/board";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CheckIcon() {
  return (
    <svg {...base} strokeWidth={3}>
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

export function StateIcon({ state }: Readonly<{ state: CardState }>) {
  switch (state) {
    case "received":
      return (
        <svg {...base} strokeWidth={2.2}>
          <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9" />
        </svg>
      );
    case "cooking":
      return (
        <svg {...base} strokeWidth={2.2}>
          <path d="M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4" />
          <path d="M4 11h16v2a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-2z" />
        </svg>
      );
    case "partial":
      return (
        <svg {...base} strokeWidth={2.4}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
        </svg>
      );
    case "ready":
      return <CheckIcon />;
    case "done":
      return (
        <svg {...base} strokeWidth={2.2}>
          <path d="M6 3h12v4a6 6 0 0 1-12 0z" />
          <path d="M12 13v4M8 21h8M18 5h2a2 2 0 0 1-2 4M6 5H4a2 2 0 0 0 2 4" />
        </svg>
      );
  }
}

export function SoundIcon() {
  return (
    <svg {...base} strokeWidth={2}>
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function FullscreenIcon() {
  return (
    <svg {...base} strokeWidth={2}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...base} strokeWidth={2.2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const CONFETTI_COLORS = ["#fa7700", "#ffc41f", "#803a4d", "#4d5e21", "#f6dfc6"];

/** Burst of confetti bits; positions are random per mount. */
export function Confetti({ count, radius, className }: Readonly<{ count: number; radius: [number, number]; className: string }>) {
  const bits = Array.from({ length: count }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const r = radius[0] + Math.random() * (radius[1] - radius[0]);
    return (
      <i
        key={i}
        style={
          {
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            "--x": `${Math.round(Math.cos(a) * r)}px`,
            "--y": `${Math.round(Math.sin(a) * r)}px`,
            "--r": `${Math.round(Math.random() * 540)}deg`,
          } as CSSProperties
        }
      />
    );
  });
  return (
    <div className={className} aria-hidden="true">
      {bits}
    </div>
  );
}
