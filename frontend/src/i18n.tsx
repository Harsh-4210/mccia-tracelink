/**
 * Internationalization (i18n) — English + Hindi + Marathi
 *
 * Now uses an auto-translation engine:
 *   - Write UI text in plain English everywhere.
 *   - Hindi / Marathi are generated at runtime from a bilingual dictionary.
 *   - Unknown phrases safely fall back to English.
 *
 * Usage:
 *   import { useI18n, I18nProvider } from "./i18n";
 *   const { t, lang, setLang } = useI18n();
 *   <p>{t("Dashboard")}</p>
 */
import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { t as autoTranslate, type TLang } from "./transliterate";

export type Lang = TLang;
export const LANGS: Lang[] = ["en", "hi", "mr"];
export const LANG_LABELS: Record<Lang, string> = { en: "EN", hi: "हि", mr: "म" };

// ── Context ────────────────────────────────────────
type I18nContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (text) => text,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("tl_lang");
    if (saved === "hi" || saved === "mr") return saved;
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("tl_lang", l);
  }, []);

  const t = useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      return autoTranslate(text, lang, vars);
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}
