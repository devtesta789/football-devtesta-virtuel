import React from "react";
import { TeamSelect } from "./TeamSelect";
import { OddsInput } from "./OddsInput";
import { PredictionResults } from "./PredictionResults";
import { RoundSyncPanel } from "./RoundSyncPanel";
import { predict, type PredictionResult } from "@/lib/prediction";
import { savePrediction } from "@/lib/cloudLearning";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export interface MatchEntry {
  homeTeam: string;
  awayTeam: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
}

export const emptyMatch = (): MatchEntry => ({
  homeTeam: "",
  awayTeam: "",
  oddsHome: "",
  oddsDraw: "",
  oddsAway: "",
});

interface Props {
  matches: MatchEntry[];
  setMatches: React.Dispatch<React.SetStateAction<MatchEntry[]>>;
  results: PredictionResult[] | null;
  setResults: React.Dispatch<React.SetStateAction<PredictionResult[] | null>>;
  loading: boolean;
  setLoading: (b: boolean) => void;
  expanded: number;
  setExpanded: (n: number) => void;
}

export function MultiMatchTab({
  matches,
  setMatches,
  results,
  setResults,
  loading,
  setLoading,
  expanded,
  setExpanded,
}: Props) {
  const [currentRoundNumber, setCurrentRoundNumber] = React.useState<number | undefined>();
  const usedTeams = matches.flatMap((m) => [m.homeTeam, m.awayTeam]).filter(Boolean);

  function update(i: number, patch: Partial<MatchEntry>) {
    setMatches((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function add() {
    if (matches.length >= 10) {
      toast.error("Maximum 10 matchs par combiné");
      return;
    }
    setMatches((m) => [...m, emptyMatch()]);
  }
  function remove(i: number) {
    if (matches.length <= 1) return;
    setMatches((m) => m.filter((_, idx) => idx !== i));
  }
  function reset() {
    setMatches([emptyMatch()]);
    setResults(null);
    setExpanded(0);
    setCurrentRoundNumber(undefined);
  }

  const allValid = matches.every(
    (m) =>
      m.homeTeam &&
      m.awayTeam &&
      m.homeTeam !== m.awayTeam &&
      parseFloat(m.oddsHome) > 1 &&
      parseFloat(m.oddsDraw) > 1 &&
      parseFloat(m.oddsAway) > 1,
  );

  async function handlePredict() {
    if (!allValid) {
      toast.error("Veuillez remplir correctement tous les matchs");
      return;
    }
    setLoading(true);
    const out: PredictionResult[] = [];
    const matchTime = new Date().toISOString();

    for (const m of matches) {
      const r = await predict(
        m.homeTeam,
        m.awayTeam,
        parseFloat(m.oddsHome),
        parseFloat(m.oddsDraw),
        parseFloat(m.oddsAway),
      );
      const id = await savePrediction(r, currentRoundNumber, matchTime);
      out.push({
        ...r,
        id: id ?? undefined,
        roundNumber: currentRoundNumber,
        matchTime,
      });
    }

    setResults(out);
    setExpanded(0);
    setLoading(false);
    toast.success(`${out.length} prédiction(s) générée(s)`);
  }

  const combinedOdds = results?.reduce(
    (acc, r) =>
      acc *
      (r.winnerLabel === "1"
        ? r.oddsHome
        : r.winnerLabel === "2"
          ? r.oddsAway
          : r.oddsDraw),
    1,
  );
  const combinedProb = results?.reduce((acc, r) => acc * r.winProb, 1);

  return (
    <div className="space-y-4">
      <RoundSyncPanel
        setMatches={setMatches}
        setResults={setResults}
        currentRoundNumber={currentRoundNumber}
        setCurrentRoundNumber={setCurrentRoundNumber}
      />

      {!results && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Targeted Fixtures [{matches.length}/10]
              </span>
              <button
                type="button"
                onClick={add}
                disabled={matches.length >= 10}
                className="font-mono text-xs uppercase tracking-widest text-cyan transition-colors hover:text-cyan/70 disabled:text-muted-foreground"
              >
                + Append match
              </button>
            </div>

            {matches.map((m, i) => {
              const others = usedTeams.filter(
                (_, idx) => idx !== i * 2 && idx !== i * 2 + 1,
              );
              return (
                <div key={i} className="space-y-3 border border-border bg-panel p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
                      Match #{String(i + 1).padStart(2, "0")}
                      {currentRoundNumber && (
                        <span className="ml-1 text-muted-foreground">
                          · R{currentRoundNumber}
                        </span>
                      )}
                    </span>
                    {matches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="font-mono text-xs uppercase tracking-widest text-danger hover:opacity-70"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TeamSelect
                      label="Home"
                      value={m.homeTeam}
                      onChange={(v) => update(i, { homeTeam: v })}
                      excludeTeam={m.awayTeam}
                      disabledTeams={others}
                    />
                    <TeamSelect
                      label="Away"
                      value={m.awayTeam}
                      onChange={(v) => update(i, { awayTeam: v })}
                      excludeTeam={m.homeTeam}
                      disabledTeams={others}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <OddsInput
                      label="Odds 1"
                      value={m.oddsHome}
                      onChange={(v) => update(i, { oddsHome: v })}
                      accent="cyan"
                    />
                    <OddsInput
                      label="Draw X"
                      value={m.oddsDraw}
                      onChange={(v) => update(i, { oddsDraw: v })}
                      accent="warn"
                    />
                    <OddsInput
                      label="Odds 2"
                      value={m.oddsAway}
                      onChange={(v) => update(i, { oddsAway: v })}
                      accent="lime"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handlePredict}
            disabled={!allValid || loading}
            className="w-full border border-cyan bg-cyan/10 px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-40"
          >
            {loading
              ? "⚡ Processing…"
              : `⚡ Predict ${matches.length} match${matches.length > 1 ? "es" : ""}`}
          </button>
        </>
      )}

      {results && (
        <>
          <div className="space-y-3 border border-border bg-panel p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Combined Sequence
                </div>
                <div className="font-mono text-sm font-bold text-foreground">
                  {results.length} match{results.length > 1 ? "es" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="font-mono text-xs uppercase tracking-widest text-cyan hover:text-cyan/70"
              >
                ↻ New combo
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Cumulated odds
                </div>
                <div className="tabular-nums font-mono text-lg font-bold text-cyan">
                  @{combinedOdds!.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Joint probability
                </div>
                <div className="tabular-nums font-mono text-lg font-bold text-lime">
                  {(combinedProb! * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {results.map((r, i) => {
              const open = expanded === i;
              const odds =
                r.winnerLabel === "1"
                  ? r.oddsHome
                  : r.winnerLabel === "2"
                    ? r.oddsAway
                    : r.oddsDraw;
              return (
                <div key={i} className="border border-border bg-panel">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? -1 : i)}
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-panel-hover"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        #{String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {r.homeTeam} vs {r.awayTeam}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-mono text-sm font-bold text-cyan">
                        {r.scoreHome}-{r.scoreAway}
                      </span>
                      <span className="tabular-nums font-mono text-xs text-lime">
                        @{odds.toFixed(2)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {open ? "▾" : "▸"}
                      </span>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-border p-3">
                      <PredictionResults
                        result={r}
                        onValidated={(updated) =>
                          setResults((rs) =>
                            rs
                              ? rs.map((x, idx) =>
                                  idx === i ? { ...x, ...updated } : x,
                                )
                              : rs,
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
