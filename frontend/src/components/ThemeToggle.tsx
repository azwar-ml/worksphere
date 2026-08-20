"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg bg-zinc-900/50 border border-zinc-800/80"></div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2.5 rounded-lg bg-zinc-900/40 dark:bg-zinc-850 border border-zinc-800/80 dark:border-zinc-700/50 hover:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 dark:hover:text-zinc-100 transition-all duration-200 cursor-pointer shadow-sm flex items-center justify-center"
      aria-label="Toggle Theme"
    >
      {theme === "dark" ? (
        <Sun className="h-4.5 w-4.5 text-amber-400 animate-pulse" />
      ) : (
        <Moon className="h-4.5 w-4.5 text-indigo-400" />
      )}
    </button>
  );
}
