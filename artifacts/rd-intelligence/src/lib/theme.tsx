import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: "dark", toggleTheme: () => {} });

// Below this viewport width we force the dark theme on, because the
// light theme has a stubborn margin-shift bug at phone + tablet sizes.
// The user's actual preference is preserved in localStorage so the moment
// the screen widens back to desktop their chosen theme reappears.
const FORCE_DARK_BREAKPOINT = 1024;

function getIsBelowLg(): boolean {
  return typeof window !== "undefined" && window.innerWidth < FORCE_DARK_BREAKPOINT;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `preferredTheme` is what the user actually picked (persisted).
  // `theme` is what we render with — it follows the preference on desktop
  // and is forced to dark on phone + tablet.
  const [preferredTheme, setPreferredTheme] = useState<Theme>(() => {
    return (localStorage.getItem("zentryx_theme") as Theme) || "light";
  });
  const [isBelowLg, setIsBelowLg] = useState<boolean>(() => getIsBelowLg());

  useEffect(() => {
    const onResize = () => setIsBelowLg(getIsBelowLg());
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const theme: Theme = isBelowLg ? "dark" : preferredTheme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  const toggleTheme = () => {
    setPreferredTheme(t => {
      const next: Theme = t === "dark" ? "light" : "dark";
      localStorage.setItem("zentryx_theme", next);
      return next;
    });
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
