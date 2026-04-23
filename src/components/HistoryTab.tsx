import React, { useEffect, useState } from "react";
import { getPredictionHistory } from "@/lib/cloudLearning";
import type { PredictionResult } from "@/lib/prediction";
import { cn } from "@/lib/utils";

export function HistoryTab() {
  const [items, setItems] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterRound, setFilterRound] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterResult, setFilterResult] = useState<"all" | "correct" | "incorrect">("all");

  useEffect(() => {
    getPredictionHistory().then((h) => {
      setItems(h);
      setLoading(false);
    });
  }, []);

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

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Loading ledger…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="border border-border bg-panel p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No predictions logged yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 border border-border bg-panel p-3">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Round
          </label>
          <select
            value={filterRound}
            onChange={(e) => setFilterRound(e.target.value)}
            className="border border-border bg-background px-3 py-1.5 font-mono text-sm"
          >
            <option value="">All rounds</option>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Team
          </label>
          <input
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            placeholder="Filter by team..."
            className="w-48 border border-border bg-background px-3 py-1.5 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Result
          </label>
          <select
            value={filterResult}
            onChange={(e) =>
              setFilterResult(e.target.value as typeof filterResult)
            }
            className="border border-border bg-background px-3 py-1.5 font-mono text-sm"
          >
            <option value="all">All</option>
            <option value="correct">Correct</option>
            <option value="incorrect">Incorrect</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setFilterRound("");
            setFilterTeam("");
            setFilterResult("all");
          }}
          className="ml-auto font-mono text-xs uppercase text-cyan hover:opacity-70"
        >
          Clear filters
        </button>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {filteredItems.length} prediction{filteredItems.length > 1 ? "s" : ""} shown
      </div>

      {filteredItems.map((r) => {
        const id = r.id ?? `${r.timestamp}`;
        const open = expanded === id;
        const date = new Date(r.timestamp);
        const matchDate = r.matchTime ? new Date(r.matchTime) : null;
        const realScore = r.validated ? `${r.realScoreHome}-${r.realScoreAway}` : null;
        const realWinner =
          r.validated && r.realScoreHome !== undefined && r.realScoreAway !== undefined
            ? r.realScoreHome > r.realScoreAway
              ? "1"
              : r.realScoreAway > r.realScoreHome
                ? "2"
                : "X"
            : null;
        const winnerCorrect = realWinner === r.winnerLabel;

        return (
          <div key={id} className="border border-border bg-panel">
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
                {matchDate && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {matchDate.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">
                  {r.homeTeam} vs {r.awayTeam}
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
                      Predicted winner
                    </div>
                    <div className="text-xs font-bold text-foreground">{r.winner}</div>
                  </div>
                  <div className="border border-border bg-background p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Confidence
                    </div>
                    <div className="tabular-nums font-mono text-xs font-bold text-foreground">
                      {r.confidence.toFixed(1)}%
                    </div>
                  </div>
                  <div className="border border-border bg-background p-2">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Odds 1/X/2
                    </div>
                    <div className="tabular-nums font-mono text-xs font-bold text-foreground">
                      {r.oddsHome}/{r.oddsDraw}/{r.oddsAway}
                    </div>
                  </div>
                </div>

                {r.topScores.length > 0 && (
                  <div>
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Top 3 predicted scores
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
