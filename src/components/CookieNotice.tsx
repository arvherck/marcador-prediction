import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "marcador_cookie_notice";

export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "dismissed") return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) setVisible(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) setVisible(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 text-card-foreground backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm">
        <p className="text-muted-foreground">
          Marcador uses essential cookies to keep you logged in. No tracking or
          advertising cookies are used.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/privacy"
            hash="cookies"
            className="rounded-md px-3 py-1.5 text-xs font-medium underline-offset-4 hover:underline"
          >
            Learn more
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md bg-amber-gradient px-3 py-1.5 text-xs font-semibold text-background shadow-glow"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
