import React from "react";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "en").slice(0, 2);
  const next = current === "fr" ? "en" : "fr";

  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(next)}
      className="flex items-center gap-1.5 border border-border bg-panel px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-panel-hover hover:text-foreground"
      title={`${t("language.label")}: ${current === "fr" ? t("language.fr") : t("language.en")} → ${next === "fr" ? t("language.fr") : t("language.en")}`}
      aria-label={t("language.label")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="size-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m-9 9h18"
        />
      </svg>
      {current.toUpperCase()}
    </button>
  );
}
