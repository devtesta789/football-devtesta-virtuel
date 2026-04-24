import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getPredictionHistory,
  getDistinctCategories,
} from "@/lib/cloudLearning";
import type { PredictionResult } from "@/lib/prediction";
import { cn } from "@/lib/utils";

export function HistoryTab() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterRound, setFilterRound] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterResult, setFilterResult] = useState<
    "all" | "correct" | "incorrect"
  >("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>("auto");

  useEffect(() => {
    getDistinctCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    const activeCategory =
      filterCategory === "auto"
        ? typeof window !== "undefined"
          ? localStorage.getItem("sporty.eventCategoryId") || undefined
          : undefined
        : filterCategory || undefined;
    getPredictionHistory(activeCategory).then((h) => {
      setItems(h);
      setLoading(false);
    });
  }, [filterCategory]);

  const filteredItems = items.filter((item) => {
    if (filterRound && item.roundNumber?.toString() !== filterRound) return false;
    if (
      filterTeam &&
      !item.homeTeam.toLowerCase().includes(filterTeam.toLowerCase()) &&
      !item.awayTeam.toLowerCase().includes(filterTeam.toLowerCase())
    )
      return false;

    if (filterResult !== "all" && item.validated) {
      const realWinner =
        item.realScoreHome! > item.realScoreAway!
          ? "1"
          : item.realScoreAway! > item.realScoreHome!
            ? "2"
            : "X";
      const correct = realWinner === item.winnerLabel;
      if (filterResult === "correct" && !correct) return false;
      if (filterResult === "incorrect" && correct) return false;
    }
    return true;
  });

  const rounds = [
    ...new Set(items.map((i) => i.roundNumber).filter(Boolean) as number[]),
  ].sort((a, b) => b - a);

  // Compute Top 3 SAFE picks per round (by winProb desc) so we can flag them in the list.
  const safePickIds = React.useMemo(() => {
    const byRound = new Map<number, PredictionResult[]>();
    for (const it of items) {
      if (!it.roundNumber || it.confidenceTier !== "SAFE") continue;
      const arr = byRound.get(it.roundNumber) ?? [];
      arr.push(it);
      byRound.set(it.roundNumber, arr);
    }
    const ids = new Set<string>();
    for (const arr of byRound.values()) {
      arr
        .sort((a, b) => b.winProb - a.winProb)
        .slice(0, 3)
        .forEach((p) => {
          const key = p.id ?? `${p.timestamp}`;
          ids.add(key);
        });
    }
    return ids;
  }, [items]);

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {t("history.loading")}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="border border-border bg-panel p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          {t("history.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 border border-border bg-panel p-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("history.season")}
          </label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-border bg-background px-3 py-1.5 font-mono text-sm"
          >
            <option value="auto">{t("history.activeSeason")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("history.round")}
          </label>
          <select
            value={filterRound}
            onChange={(e) => setFilterRound(e.target.value)}
            className="border border-border bg-background px-3 py-1.5 font-mono text-sm"
          >
            <option value="">{t("history.allRounds")}</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                {t("history.round")} {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("history.team")}
          </label>
          <input
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            placeholder={t("history.teamPlaceholder")}
            className="w-48 border border-border bg-background px-3 py-1.5 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("history.result")}
          </label>
          <select
            value={filterResult}
            onChange={(e) =>
              setFilterResult(e.target.value as typeof filterResult)
            }
            className="border border-border bg-background px-3 py-1.5 font-mono text-sm"
          >
            <option value="all">{t("history.all")}</option>
            <option value="correct">{t("history.correct")}</option>
            <option value="incorrect">{t("history.incorrect")}</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setFilterRound("");
            setFilterTeam("");
            setFilterResult("all");
            setFilterCategory("auto");
          }}
          className="ml-auto font-mono text-xs uppercase text-cyan hover:opacity-70"
        >
          {t("history.clear")}
        </button>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("history.shown", { count: filteredItems.length })}
      </div>

      {filteredItems.map((r) => {
        const id = r.id ?? `${r.timestamp}`;
        const open = expanded === id;
        const date = new Date(r.timestamp);
        const matchDate = r.matchTime ? new Date(r.matchTime) : null;
        const realScore = r.validated
          ? `${r.realScoreHome}-${r.realScoreAway}`
          : null;
        const realWinner =
          r.validated &&
          r.realScoreHome !== undefined &&
          r.realScoreAway !== undefined
            ? r.realScoreHome > r.realScoreAway
              ? "1"
              : r.realScoreAway > r.realScoreHome
                ? "2"
                : "X"
            : null;
        const winnerCorrect = realWinner === r.winnerLabel;
        const isSafePick = safePickIds.has(id);

        return (
          <div
            key={id}
            className={cn(
              "border bg-panel",
              isSafePick ? "border-cyan/60" : "border-border",
            )}
          >
            <button
              type="button"
              onClick={() => setExpanded(open ? null : id)}
              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-panel-hover"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {date.toLocaleDateString()}
                </span>
                {r.roundNumber && (
                  <span className="border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    R{r.roundNumber}
                  </span>
                )}
                {isSafePick && (
                  <span
                    title={t("historyExtra.safePickTitle")}
                    className="border border-cyan bg-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan"
                  >
                    ★ {t("historyExtra.safePick")}
                  </span>
                )}
                {isSafePick && r.validated && (
                  <span
                    className={cn(
                      "border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest",
                      winnerCorrect
                        ? "border-lime bg-lime/10 text-lime"
                        : "border-danger bg-danger/10 text-danger",
                    )}
                  >
                    {winnerCorrect
                      ? t("historyExtra.pickHit")
                      : t("historyExtra.pickMiss")}
                  </span>
                )}
                {matchDate && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {matchDate.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">
                  {r.homeTeam} {t("history.vs")} {r.awayTeam}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-mono text-sm font-bold text-cyan">
                  {r.scoreHome}-{r.scoreAway}
                </span>
                {realScore && (
                  <span
                    className={cn(
                      "tabular-nums border px-2 py-0.5 font-mono text-[10px]",
                      winnerCorrect
                        ? "border-lime text-lime"
                        : "border-danger text-danger",
                    )}
                  >
                    {realScore}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {open ? "▾" : "▸"}
                </span>
              </div>
            </button>
            {open && (
              <div className="space-y-3 border-t border-border p-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-border bg-background p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t("history.predictedWinner")}
                    </div>
                    <div className="text-xs font-bold text-foreground">
                      {r.winner}
                    </div>
                  </div>
                  <div className="border border-border bg-background p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t("history.confidence")}
                    </div>
                    <div className="tabular-nums font-mono text-xs font-bold text-foreground">
                      {r.confidence.toFixed(1)}%
                    </div>
                  </div>
                  <div className="border border-border bg-background p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t("history.odds")}
                    </div>
                    <div className="tabular-nums font-mono text-xs font-bold text-foreground">
                      {r.oddsHome}/{r.oddsDraw}/{r.oddsAway}
                    </div>
                  </div>
                </div>

                {r.topScores.length > 0 && (
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {t("history.topScores")}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {r.topScores.map((s, i) => {
                        const isReal = realScore === s.score;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "border bg-background p-2 text-center",
                              isReal ? "border-lime" : "border-border",
                            )}
                          >
                            <div className="tabular-nums font-mono text-xs font-bold text-foreground">
                              {s.score} {isReal && "✓"}
                            </div>
                            <div className="tabular-nums font-mono text-[10px] text-muted-foreground">
                              {(s.prob * 100).toFixed(0)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
