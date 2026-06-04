import { useEffect, useState } from "react";

const KEY = "marcador_guest";
const EVT = "marcador-guest-change";

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuest(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (v) window.sessionStorage.setItem(KEY, "1");
    else window.sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* no-op */
  }
}

export function clearGuest() {
  setGuest(false);
}

export function useGuest(): boolean {
  const [v, setV] = useState<boolean>(false);
  useEffect(() => {
    setV(isGuest());
    const h = () => setV(isGuest());
    window.addEventListener(EVT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVT, h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return v;
}
