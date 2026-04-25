import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UsageGuide({ open, onClose }: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg border border-cyan bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan">
            ?  {t("guide.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ✕ {t("guide.close")}
          </button>
        </div>

        <div className="space-y-3 font-mono text-[12px] leading-relaxed text-foreground">
          <p>{t("guide.step1")}</p>
          <p>{t("guide.step2")}</p>
          <p>{t("guide.step3")}</p>
          <p>{t("guide.step4")}</p>
          <p className="border-l-2 border-cyan pl-2 text-muted-foreground">
            {t("guide.note")}
          </p>
          <p className="border border-warn/40 bg-warn/10 p-2 text-warn">
            ⚠ {t("guide.warning")}
          </p>
        </div>
      </div>
    </div>
  );
}
