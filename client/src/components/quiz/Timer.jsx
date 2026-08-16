import { useEffect, useRef, useState } from 'react';

function format(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function Timer({ minutes, onExpire }) {
  const [remaining, setRemaining] = useState(minutes * 60);

  // Held in a ref so the countdown interval is created once and never restarts
  // because the parent handed down a new function identity.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((seconds) => {
        if (seconds <= 1) {
          clearInterval(timer);
          onExpireRef.current?.();
          return 0;
        }

        return seconds - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [minutes]);

  const urgent = remaining <= 30;
  const low = remaining <= 60;

  return (
    <div
      role="timer"
      aria-live={urgent ? 'assertive' : 'off'}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums transition-colors duration-300 ${
        low ? 'bg-wrong-50 text-wrong-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 4a.75.75 0 0 0-1.5 0v4c0 .28.16.54.4.67l2.5 1.5a.75.75 0 1 0 .7-1.34l-2.1-1.26V6Z"
          clipRule="evenodd"
        />
      </svg>
      <span className="sr-only">Time remaining: </span>
      {format(remaining)}
    </div>
  );
}
