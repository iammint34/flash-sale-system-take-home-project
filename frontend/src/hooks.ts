import { useEffect, useRef, useState } from 'react';

// polls an async fn on an interval and exposes the latest value + any error.
// `active` lets callers pause polling (e.g. stop hitting did-i-secure once
// the order is confirmed). the fn is kept in a ref so a caller can pass an
// inline closure without resetting the interval every render.
export function usePoll<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  active = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const tick = async () => {
      try {
        const v = await fnRef.current();
        if (alive) {
          setData(v);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e);
      }
    };

    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs, active]);

  return { data, error };
}

// a value mirrored to localStorage so the buyer keeps their identity across
// refreshes — handy when eyeballing the reserved → confirmed transition.
export function usePersistedState(key: string, initial: string) {
  const [value, setValue] = useState(
    () => localStorage.getItem(key) ?? initial,
  );
  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
