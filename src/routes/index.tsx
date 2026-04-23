import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MultiMatchTab,
  emptyMatch,
  type MatchEntry,
} from "@/components/MultiMatchTab";
import { HistoryTab } from "@/components/HistoryTab";
import { LearningDashboard } from "@/components/LearningDashboard";
import type { PredictionResult } from "@/lib/prediction";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
});

type Tab = "predict" | "history" | "ai";

function Index() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("predict");
  const [matches, setMatches] = useState<MatchEntry[]>([emptyMatch()]);
  const [results, setResults] = useState<PredictionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(0);

  return (
    <div className="space-y-4">
      <nav className="border-b border-border">
        <div className="flex gap-1">
          <TabBtn active={tab === "predict"} onClick={() => setTab("predict")}>
            🎯 {t("tabs.predict")}
          </TabBtn>
          <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
            ⏱ {t("tabs.history")}
          </TabBtn>
          <TabBtn active={tab === "ai"} onClick={() => setTab("ai")}>
            🧠 {t("tabs.ai")}
          </TabBtn>
        </div>
      </nav>

      <section>
        {tab === "predict" && (
          <MultiMatchTab
            matches={matches}
            setMatches={setMatches}
            results={results}
            setResults={setResults}
            loading={loading}
            setLoading={setLoading}
            expanded={expanded}
            setExpanded={setExpanded}
          />
        )}
        {tab === "history" && <HistoryTab />}
        {tab === "ai" && <LearningDashboard />}
      </section>

      <footer className="border-t border-border pt-4">
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {t("app.footer")}
        </p>
      </footer>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors",
        active
          ? "text-cyan"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-px bg-cyan" />
      )}
    </button>
  );
}
