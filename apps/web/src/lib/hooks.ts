import { useEffect, useRef, useState } from 'react';
import { serverNow } from './socket';

/** Re-render every `ms` and return the server-corrected current time. */
export function useServerNow(ms = 100): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useCountdown(
  endsAt: number | null | undefined,
  paused = false,
  pausedRemainingMs: number | null = null,
) {
  const now = useServerNow(100);
  if (!endsAt) return 0;
  if (paused && pausedRemainingMs !== null) return pausedRemainingMs;
  return Math.max(0, endsAt - now);
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
