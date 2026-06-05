import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { setThemePreferenceFn } from "@/lib/theme.functions";
import { useGuest } from "@/lib/guest";

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const guest = useGuest();
  const next = theme === "dark" ? "light" : "dark";

  const onClick = () => {
    setTheme(next);
    if (!guest) {
      // Fire-and-forget sync to profile.
      setThemePreferenceFn({ data: { theme: next } }).catch(() => {});
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-200"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
