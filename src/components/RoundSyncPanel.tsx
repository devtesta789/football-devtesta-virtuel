import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchRound,
  scanRoundStatuses,
  fetchAllPlayedMatches,
  discoverAllCategories,
  rescanPartialRounds,
  seedScoreCache,
  type SportyMatch,
  type RoundStatus,
} from "@/lib/sportyApi";
import {
  getPredictionHistory,
  updateModelWeights,
  savePrediction,
  getLearningStats,
  getValidatedScoresMap,
} from "@/lib/cloudLearning";
import { predict } from "@/lib/prediction";
import { getUserConfig, setEventCategoryId as persistEventCategoryId } from "@/lib/userConfig";
import { emptyMatch, type MatchEntry } from "./MultiMatchTab";
import { cn } from "@/lib/utils";
import type { PredictionResult } from "@/lib/prediction";
import toast from "react-hot-toast";

interface Props {
  setMatches: React.Dispatch<React.SetStateAction<MatchEntry[]>>;
  setResults: React.Dispatch<React.SetStateAction<PredictionResult[] | null>>;
  currentRoundNumber?: number;
  setCurrentRoundNumber?: (n: number) => void;
}

const LEAGUE_ID = "8035";

export function RoundSyncPanel({ setMatches, setResults, setCurrentRoundNumber }: Props) {
  const { t } = useTranslation();
  const [eventCategoryId, setEventCategoryIdState] = useState("");
  const [round, setRound] = useState("1");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [preview, setPreview] = useState<SportyMatch[] | null>(null);
  const [statuses, setStatuses] = useState<RoundStatus[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [validatingRound, setValidatingRound] = useState<number | null>(null);
  const [trainingAI, setTrainingAI] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState({
    current: 0,
    total: 0,
    matchesFound: 0,
  });
  const [discovering, setDiscovering] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<
    { id: string; roundCount: number }[]
  >([]);
  const [rescanning, setRescanning] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  // Auto-mode: scan + auto-validate every 30s
  useEffect(() => {
    if (!autoMode) return;
    const id = setInterval(async () => {
      await handleScanStatuses();
      await handleAutoValidate();
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode]);

  // Seed local score cache from validated predictions in Supabase so that
  // partial rounds (where the API has already purged some scores) can still
  // be reconstructed from history.
  useEffect(() => {
    (async () => {
      try {
        const map = await getValidatedScoresMap();
        const remapped: Record<string, { home: number; away: number }> = {};
        for (const [key, v] of Object.entries(map)) remapped[key] = v;
        const added = seedScoreCache(remapped);
        if (added > 0) {
          // silent — just informational in console
          console.info(`[scoreCache] seeded ${added} score(s) from Supabase`);
        }
      } catch {
        /* silent */
      }
    })();
  }, []);

  // Load persisted config on mount; fall back to API discovery
  useEffect(() => {
    (async () => {
      try {
        const config = await getUserConfig();
        if (config.eventCategoryId) {
          setEventCategoryIdState(config.eventCategoryId);
          setActiveCat(config.eventCategoryId);
          localStorage.setItem("sporty.eventCategoryId", config.eventCategoryId);
          return;
        }
        const local = localStorage.getItem("sporty.eventCategoryId");
        if (local) {
          setEventCategoryIdState(local);
          setActiveCat(local);
          await persistEventCategoryId(local);
          return;
        }
        // Auto-discover
        const fr = await fetchRound(LEAGUE_ID, "1", undefined);
        if (fr.eventCategoryId) {
          setEventCategoryIdState(fr.eventCategoryId);
          setActiveCat(fr.eventCategoryId);
          localStorage.setItem("sporty.eventCategoryId", fr.eventCategoryId);
          await persistEventCategoryId(fr.eventCategoryId);
        }
      } catch {
        /* silent */
      }
    })();
  }, []);

  useEffect(() => {
    if (eventCategoryId) {
      localStorage.setItem("sporty.eventCategoryId", eventCategoryId);
    }
  }, [eventCategoryId]);

  async function ensureCat(): Promise<string> {
    let cat = activeCat || eventCategoryId.trim();
    if (!cat) {
      const fr = await fetchRound(LEAGUE_ID, "1", undefined);
      cat = fr.eventCategoryId;
      setActiveCat(cat);
      if (cat) await persistEventCategoryId(cat);
    }
    return cat;
  }

  async function handleSyncRound() {
    if (!round) return;
    setLoading(true);
    setStatus(null);
    setPreview(null);
    try {
      const { matches, eventCategoryId: cat } = await fetchRound(
        LEAGUE_ID,
        round,
        eventCategoryId.trim() || undefined,
      );
      setActiveCat(cat);
      if (matches.length === 0) {
        toast.error(t("sync.noMatch"));
      } else {
        const entries: MatchEntry[] = matches.slice(0, 10).map((m) => ({
          ...emptyMatch(),
          homeTeam: m.matched ? m.homeTeam : "",
          awayTeam: m.matched ? m.awayTeam : "",
          oddsHome: m.oddsHome,
          oddsDraw: m.oddsDraw,
          oddsAway: m.oddsAway,
        }));
        setResults(null);
        setMatches(entries);
        setPreview(matches);
        setCurrentRoundNumber?.(parseInt(round));

        const unmatched = matches.filter((m) => !m.matched).length;
        const withOdds = matches.filter((m) => m.oddsHome && m.oddsDraw && m.oddsAway).length;
        const playedCount = matches.filter((m) => m.played).length;

        toast.success(t("sync.syncedRound", { round, count: entries.length }));
        setStatus({
          kind: unmatched ? "info" : "ok",
          text:
            t("sync.statusOk", { round, count: entries.length, withOdds }) +
            (playedCount ? t("sync.alreadyPlayed", { count: playedCount }) : "") +
            (unmatched ? t("sync.unmatched", { count: unmatched }) : ""),
        });
      }
    } catch (e) {
      toast.error(t("sync.failed", { error: (e as Error).message }));
    }
    setLoading(false);
  }

  function loadIntoForm() {
    if (!preview) return;
    const entries: MatchEntry[] = preview.slice(0, 10).map((m) => ({
      ...emptyMatch(),
      homeTeam: m.matched ? m.homeTeam : "",
      awayTeam: m.matched ? m.awayTeam : "",
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
    }));
    setResults(null);
    setMatches(entries);
    setCurrentRoundNumber?.(parseInt(round));
    toast.success(t("sync.reloaded", { count: entries.length }));
  }

  async function handleScanStatuses() {
    setScanning(true);
    try {
      const cat = await ensureCat();
      // Re-seed from Supabase right before scanning so any newly validated
      // scores are available to combineRoundData via the local cache.
      try {
        const map = await getValidatedScoresMap();
        seedScoreCache(map);
      } catch {
        /* silent */
      }
      const sts = await scanRoundStatuses(LEAGUE_ID, cat);
      setStatuses(sts);
      const r38 = sts.find((s) => s.round === 38);
      if (r38 && r38.total > 0 && r38.played === r38.total) {
        toast(t("sync.seasonEnded"), { icon: "🏁", duration: 10000 });
      }
      const playedRounds = sts.filter((s) => s.played === s.total && s.total > 0).length;
      toast.success(t("sync.scanDone", { count: playedRounds }));
    } catch (e) {
      toast.error(t("sync.scanFailed", { error: (e as Error).message }));
    }
    setScanning(false);
  }

  async function handleRescanPartial() {
    const partial = statuses
      .filter((s) => s.total > 0 && s.played > 0 && s.played < s.total)
      .map((s) => s.round);
    if (partial.length === 0) {
      toast(t("sync.noPlayed"), { icon: "ℹ️" });
      return;
    }
    setRescanning(true);
    try {
      const cat = await ensureCat();
      // Refresh seed first
      try {
        const map = await getValidatedScoresMap();
        seedScoreCache(map);
      } catch {
        /* silent */
      }
      const { filled, statuses: updated } = await rescanPartialRounds(LEAGUE_ID, cat, partial);
      // Merge updated statuses into the existing list
      setStatuses((prev) => {
        const map = new Map(prev.map((s) => [s.round, s]));
        for (const s of updated) map.set(s.round, s);
        return [...map.values()].sort((a, b) => a.round - b.round);
      });
      toast.success(t("sync.rescanDone", { filled }));
    } catch (e) {
      toast.error(t("sync.scanFailed", { error: (e as Error).message }));
    }
    setRescanning(false);
  }

  async function handleValidateRound(roundNumber: number) {
    setValidatingRound(roundNumber);
    try {
      const cat = await ensureCat();
      const { matches } = await fetchRound(LEAGUE_ID, String(roundNumber), cat);
      const playedMatches = matches.filter(
        (m) => m.played && m.finalScoreHome !== undefined && m.finalScoreAway !== undefined,
      );
      // Pull all history (no category filter) so older saisons can still be validated
      const history = await getPredictionHistory();
      const pending = history.filter((h) => !h.validated && h.roundNumber === roundNumber);

      if (pending.length === 0) {
        toast(t("sync.noPending", { round: roundNumber }), {
          icon: "ℹ️",
          duration: 4000,
        });
        return;
      }

      if (playedMatches.length === 0) {
        toast.error(t("sync.noScores", { round: roundNumber }), { duration: 6000 });
        return;
      }

      let validated = 0;
      let notFound = 0;
      for (const m of playedMatches) {
        const pred = pending.find((p) => p.homeTeam === m.homeTeam && p.awayTeam === m.awayTeam);
        if (pred) {
          await updateModelWeights(pred, {
            home: m.finalScoreHome!,
            away: m.finalScoreAway!,
          });
          validated++;
        } else {
          notFound++;
        }
      }

      const sts = await scanRoundStatuses(LEAGUE_ID, cat);
      setStatuses(sts);

      if (validated > 0) {
        toast.success(
          notFound > 0
            ? t("sync.validatedRoundExtra", {
                round: roundNumber,
                count: validated,
                notFound,
              })
            : t("sync.validatedRound", { round: roundNumber, count: validated }),
        );
      } else {
        toast.error(t("sync.noMatchPending", { round: roundNumber }), {
          duration: 5000,
        });
      }
    } catch (e) {
      toast.error(t("sync.failed", { error: (e as Error).message }));
    }
    setValidatingRound(null);
  }

  async function handleAutoValidate() {
    setValidating(true);
    try {
      const cat = await ensureCat();
      const [played, history] = await Promise.all([
        fetchAllPlayedMatches(LEAGUE_ID, cat),
        getPredictionHistory(),
      ]);

      const pending = history.filter((h) => !h.validated);

      if (pending.length === 0) {
        toast(t("sync.noPendingValid"), { icon: "ℹ️" });
        return;
      }

      const totalPlayed = played.reduce((a, r) => a + r.matches.length, 0);
      if (totalPlayed === 0) {
        toast.error(t("sync.noScoresAvail", { count: pending.length }), {
          duration: 6000,
        });
        return;
      }

      let validated = 0;
      const results = await Promise.all(
        played.flatMap((r) =>
          r.matches.map(async (m) => {
            if (m.finalScoreHome === undefined || m.finalScoreAway === undefined) return false;
            const pred = pending.find(
              (p) => p.homeTeam === m.homeTeam && p.awayTeam === m.awayTeam,
            );
            if (!pred) return false;
            await updateModelWeights(pred, {
              home: m.finalScoreHome,
              away: m.finalScoreAway,
            });
            return true;
          }),
        ),
      );
      validated = results.filter(Boolean).length;

      const sts = await scanRoundStatuses(LEAGUE_ID, cat);
      setStatuses(sts);

      if (validated > 0) {
        toast.success(t("sync.autoValidated", { count: validated, total: pending.length }));
        setTimeout(() => {
          toast(t("sync.checkDashboard"), { icon: "🧠", duration: 5000 });
        }, 2000);
      } else {
        toast.error(t("sync.noMatchAuto", { played: totalPlayed }), {
          duration: 6000,
        });
      }
    } catch (e) {
      toast.error(t("sync.autoFailed", { error: (e as Error).message }));
    }
    setValidating(false);
  }

  async function handleTrainOnAllPlayedRounds() {
    setTrainingAI(true);
    setTrainingProgress({ current: 0, total: 0, matchesFound: 0 });
    const startTime = Date.now();
    try {
      const cat = await ensureCat();

      const sts = await scanRoundStatuses(LEAGUE_ID, cat, 38, 6);
      setStatuses(sts);
      const playedRounds = sts.filter((s) => s.played > 0).map((s) => s.round);

      if (playedRounds.length === 0) {
        toast(t("sync.noPlayed"), { icon: "ℹ️" });
        setTrainingAI(false);
        return;
      }

      setTrainingProgress((prev) => ({ ...prev, total: playedRounds.length }));

      // Fetch all history (across all categories) to detect duplicates
      const existingHistory = await getPredictionHistory();
      const existingSet = new Set(
        existingHistory.map((h) => `${h.roundNumber}|${h.homeTeam}|${h.awayTeam}`),
      );

      let totalImported = 0;
      let totalValidated = 0;
      const BATCH_SIZE = 3;

      for (let batchStart = 0; batchStart < playedRounds.length; batchStart += BATCH_SIZE) {
        const batch = playedRounds.slice(batchStart, batchStart + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (roundNum) => {
            try {
              const { matches } = await fetchRound(LEAGUE_ID, String(roundNum), cat);
              const playedMatches = matches.filter(
                (m) =>
                  m.played &&
                  m.matched &&
                  m.finalScoreHome !== undefined &&
                  m.finalScoreAway !== undefined,
              );
              return { roundNum, matches: playedMatches };
            } catch {
              return { roundNum, matches: [] as SportyMatch[] };
            }
          }),
        );

        for (const { roundNum, matches } of batchResults) {
          const roundImported: PredictionResult[] = [];
          for (const match of matches) {
            const matchKey = `${roundNum}|${match.homeTeam}|${match.awayTeam}`;
            if (existingSet.has(matchKey) || !match.oddsHome || !match.oddsDraw || !match.oddsAway)
              continue;
            try {
              const prediction = await predict(
                match.homeTeam,
                match.awayTeam,
                parseFloat(match.oddsHome),
                parseFloat(match.oddsDraw),
                parseFloat(match.oddsAway),
              );
              const id = await savePrediction(prediction, roundNum, match.matchTime, cat);
              if (id) {
                roundImported.push({
                  ...prediction,
                  id,
                  roundNumber: roundNum,
                  matchTime: match.matchTime,
                });
                existingSet.add(matchKey);
              }
            } catch {
              /* skip */
            }
          }

          for (const pred of roundImported) {
            const m = matches.find(
              (mm) => mm.homeTeam === pred.homeTeam && mm.awayTeam === pred.awayTeam,
            );
            if (m?.finalScoreHome !== undefined && m?.finalScoreAway !== undefined) {
              await updateModelWeights(pred, {
                home: m.finalScoreHome,
                away: m.finalScoreAway,
              });
              totalValidated++;
            }
          }

          totalImported += roundImported.length;
          setTrainingProgress((prev) => ({
            ...prev,
            current: prev.current + 1,
            matchesFound: totalImported,
          }));
        }
      }

      const finalStats = await getLearningStats();
      setStatuses(await scanRoundStatuses(LEAGUE_ID, cat, 38, 6));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      toast.success(
        t("sync.trainDone", {
          imported: totalImported,
          validated: totalValidated,
          elapsed,
          accuracy: (finalStats.accuracy * 100).toFixed(1),
        }),
        { duration: 8000 },
      );
      setStatus({
        kind: "ok",
        text: t("sync.trainStatus", {
          imported: totalImported,
          validated: totalValidated,
          accuracy: (finalStats.accuracy * 100).toFixed(1),
          elapsed,
        }),
      });
    } catch (e) {
      toast.error(t("sync.trainFailed", { error: (e as Error).message }));
    } finally {
      setTrainingAI(false);
      setTrainingProgress({ current: 0, total: 0, matchesFound: 0 });
    }
  }

  async function handleDiscoverCategories() {
    setDiscovering(true);
    try {
      const cats = await discoverAllCategories(LEAGUE_ID);
      setAvailableCategories(cats);
      if (cats.length === 0) {
        toast(t("sync.noCategoriesFound"), { icon: "ℹ️" });
      } else {
        toast.success(t("sync.categoriesFound", { count: cats.length }));
      }
    } catch (e) {
      toast.error(t("sync.discoverFailed", { error: (e as Error).message }));
    }
    setDiscovering(false);
  }

  async function handleChangeCategory(newId: string) {
    setEventCategoryIdState(newId);
    setActiveCat(newId);
    localStorage.setItem("sporty.eventCategoryId", newId);
    await persistEventCategoryId(newId);
    setPreview(null);
    setStatuses([]);
    setStatus(null);
    toast.success(t("sync.categorySet", { id: newId }));
  }

  const fullyPlayedRounds = statuses
    .filter((s) => s.total > 0 && s.played === s.total)
    .map((s) => s.round);

  return (
    <div className="space-y-3 border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-1.5 animate-pulse bg-cyan" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
            {t("sync.title")}
          </span>
          {activeCat && (
            <>
              <span className="font-mono text-[10px] text-muted-foreground">· cat {activeCat}</span>
              <span className="border border-lime/60 bg-lime/10 px-1 font-mono text-[9px] uppercase text-lime">
                {t("sync.active")}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? `✕ ${t("sync.close")}` : `⚙ ${t("sync.advanced")}`}
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("sync.eventCategoryId")}
            </label>
            <div className="flex gap-2">
              <input
                value={eventCategoryId}
                onChange={(e) => setEventCategoryIdState(e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== activeCat) handleChangeCategory(v);
                }}
                placeholder={t("sync.autoDiscovered")}
                className="flex-1 border border-border bg-background px-3 py-2 font-mono text-sm focus:border-cyan focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDiscoverCategories}
                disabled={discovering}
                className="border border-cyan bg-cyan/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
              >
                {discovering ? "⟳" : `🔍 ${t("sync.discover")}`}
              </button>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              {t("sync.leagueId")}: {LEAGUE_ID} ·{" "}
              {availableCategories.length > 0
                ? t("sync.foundCount", { count: availableCategories.length })
                : t("sync.useDiscover")}
            </p>
          </div>

          {availableCategories.length > 0 && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("sync.availableCategories")}
              </div>
              <div className="space-y-1">
                {availableCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleChangeCategory(cat.id)}
                    className={cn(
                      "flex w-full items-center justify-between border px-3 py-1.5 font-mono text-xs transition-colors",
                      eventCategoryId === cat.id
                        ? "border-cyan bg-cyan/10 text-cyan"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <span>cat {cat.id}</span>
                    <span>
                      {cat.roundCount} {t("sync.matchesPerRound")}
                    </span>
                  </button>
                ))}
              </div>
              <p className="font-mono text-[10px] text-warn">{t("sync.changeWarning")}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("sync.roundLabel")}
          </label>
          <select
            value={round}
            onChange={(e) => setRound(e.target.value)}
            className="border border-border bg-background px-3 py-2 font-mono text-sm focus:border-cyan focus:outline-none"
          >
            {Array.from({ length: 38 }, (_, i) => i + 1).map((n) => {
              const st = statuses.find((s) => s.round === n);
              const tag = st
                ? st.played === st.total && st.total > 0
                  ? " ✓"
                  : st.played > 0
                    ? ` ${st.played}/${st.total}`
                    : " ◯"
                : "";
              return (
                <option key={n} value={n}>
                  {t("history.round")} {n}
                  {tag}
                </option>
              );
            })}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSyncRound}
          disabled={loading}
          className="self-end border border-cyan bg-cyan/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-40"
        >
          {loading ? "⟳" : "⬇"} {t("sync.sync")}
        </button>
        <button
          type="button"
          onClick={handleScanStatuses}
          disabled={scanning}
          className="self-end border border-border bg-background px-3 py-2 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:bg-panel-hover disabled:opacity-40"
        >
          {scanning ? "⟳" : "🔍"} {t("sync.scan")}
        </button>
      </div>

      {fullyPlayedRounds.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("sync.completedRounds")}
          </div>
          <div className="flex flex-wrap gap-2">
            {fullyPlayedRounds.map((rn) => (
              <button
                key={rn}
                type="button"
                onClick={() => handleValidateRound(rn)}
                disabled={validatingRound === rn}
                className="border border-lime bg-lime/10 px-3 py-1.5 font-mono text-xs text-lime transition-colors hover:bg-lime/20 disabled:opacity-40"
              >
                {validatingRound === rn ? "⟳" : "✓"} R{rn}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-3">
        {trainingAI ? (
          <div className="space-y-2 border border-cyan bg-cyan/5 p-3">
            <div className="flex items-center gap-2">
              <span className="animate-spin font-mono text-cyan">⟳</span>
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-cyan">
                {t("sync.training")}
              </span>
            </div>
            {trainingProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>
                    {t("sync.trainProgress", {
                      current: trainingProgress.current,
                      total: trainingProgress.total,
                    })}
                  </span>
                  <span>{t("sync.matchesFound", { count: trainingProgress.matchesFound })}</span>
                </div>
                <div className="h-1 w-full bg-border">
                  <div
                    className="h-full bg-cyan transition-all"
                    style={{
                      width: `${(trainingProgress.current / trainingProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleTrainOnAllPlayedRounds}
            className="flex w-full items-center justify-center gap-2 border border-cyan bg-cyan/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20"
          >
            <span>🧠</span>
            <span>{t("sync.train")}</span>
          </button>
        )}
        <p className="font-mono text-[10px] text-muted-foreground">{t("sync.trainHint")}</p>
      </div>

      <button
        type="button"
        onClick={handleAutoValidate}
        disabled={validating}
        className="w-full border border-lime bg-lime/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-lime transition-colors hover:bg-lime/20 disabled:opacity-40"
      >
        {validating ? `⟳ ${t("sync.validating")}` : `✓ ${t("sync.autoValidate")}`}
      </button>

      <button
        type="button"
        onClick={() => setAutoMode((v) => !v)}
        className={cn(
          "w-full border px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors",
          autoMode
            ? "border-cyan bg-cyan/20 text-cyan"
            : "border-border bg-background text-muted-foreground hover:border-foreground/40",
        )}
      >
        {autoMode ? `🔄 ${t("sync.autoModeOn")}` : `🔄 ${t("sync.autoModeOff")}`}
      </button>

      {statuses.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("sync.statuses")}
            </span>
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-lime" /> {t("sync.complete")}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-warn" /> {t("sync.partial")}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-border" /> {t("sync.upcoming")}
              </span>
            </div>
          </div>

          {statuses.some((s) => s.played > 0 && s.played < s.total) && (
            <button
              type="button"
              onClick={handleRescanPartial}
              disabled={rescanning}
              className="w-full border border-warn bg-warn/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-warn transition-colors hover:bg-warn/20 disabled:opacity-40"
            >
              {rescanning ? "⟳ " : "🔁 "}
              {t("sync.rescanPartial")}
            </button>
          )}

          <div className="grid grid-cols-10 gap-1">
            {statuses.map((s) => {
              const fully = s.total > 0 && s.played === s.total;
              const partial = s.played > 0 && !fully;
              return (
                <button
                  key={s.round}
                  type="button"
                  onClick={() => setRound(String(s.round))}
                  title={`${t("history.round")} ${s.round} · ${s.played}/${s.total}`}
                  className={cn(
                    "aspect-square border font-mono text-[10px] transition-colors",
                    fully && "border-lime/60 bg-lime/20 text-lime hover:bg-lime/30",
                    partial && "border-warn/60 bg-warn/20 text-warn hover:bg-warn/30",
                    !fully &&
                      !partial &&
                      "border-border bg-background text-muted-foreground hover:border-foreground/40",
                    String(s.round) === round && "ring-1 ring-cyan",
                  )}
                >
                  {s.round}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {status && (
        <div
          className={cn(
            "border p-2 font-mono text-[11px]",
            status.kind === "ok" && "border-lime/40 bg-lime/5 text-lime",
            status.kind === "info" && "border-warn/40 bg-warn/5 text-warn",
            status.kind === "err" && "border-danger/40 bg-danger/5 text-danger",
          )}
        >
          {status.text}
        </div>
      )}

      {preview && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("sync.preview")} · {preview.length}
            </span>
            <button
              type="button"
              onClick={loadIntoForm}
              className="font-mono text-[10px] uppercase tracking-widest text-cyan hover:opacity-70"
            >
              ⚡ {t("sync.load")}
            </button>
          </div>
          <div className="space-y-1">
            {preview.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between border border-border bg-background px-2 py-1.5 text-[11px]"
              >
                <div className="flex items-center gap-2">
                  {m.played && (
                    <span className="font-mono text-lime">
                      FT {m.finalScoreHome}-{m.finalScoreAway}
                    </span>
                  )}
                  {m.matched ? (
                    <span className="text-foreground">
                      {m.homeTeam} vs {m.awayTeam}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {m.rawHome} vs {m.rawAway} (?)
                    </span>
                  )}
                </div>
                <span className="font-mono text-muted-foreground">
                  {m.oddsHome || "—"} · {m.oddsDraw || "—"} · {m.oddsAway || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
