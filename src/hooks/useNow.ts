import { useEffect, useState } from "react";

/** Returns Date.now(), re-rendering every `intervalMs` milliseconds. */
export function useNow(intervalMs: number = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
