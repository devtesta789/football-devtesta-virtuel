import React, { useEffect, useState } from "react";
import {
  fetchRound,
  scanRoundStatuses,
  fetchAllPlayedMatches,
  discoverAllCategories,
  type SportyMatch,
  type RoundStatus,
} from "@/lib/sportyApi";
import {
  getPredictionHistory,
  updateModelWeights,
  savePrediction,
  getLearningStats,
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

export function RoundSyncPanel({
  setMatches,
  setResults,
  setCurrentRoundNumber,
}: Props) {
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
        toast.error("Aucun match retourné par l'API.");
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
        const withOdds = matches.filter(
          (m) => m.oddsHome && m.oddsDraw && m.oddsAway,
        ).length;
        const playedCount = matches.filter((m) => m.played).length;

        toast.success(`Round ${round} synchronisé · ${entries.length} matchs`);
        setStatus({
          kind: unmatched ? "info" : "ok",
          text: `Round ${round} → ${entries.length} matchs · ${withOdds} avec cotes${
            playedCount ? ` · ${playedCount} déjà joué(s)` : ""
          }${unmatched ? ` · ${unmatched} équipe(s) non reconnue(s)` : ""}.`,
        });
      }
    } catch (e) {
      toast.error(`Échec : ${(e as Error).message}`);
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
    toast.success(`Rechargé ${entries.length} matchs`);
  }

  async function handleScanStatuses() {
    setScanning(true);
    try {
      const cat = await ensureCat();
      const sts = await scanRoundStatuses(LEAGUE_ID, cat);
      setStatuses(sts);
      const playedRounds = sts.filter(
        (s) => s.played === s.total && s.total > 0,
      ).length;
      toast.success(`Scan terminé · ${playedRounds} rounds complets`);
    } catch (e) {
      toast.error(`Scan échoué : ${(e as Error).message}`);
    }
    setScanning(false);
  }

  async function handleValidateRound(roundNumber: number) {
    setValidatingRound(roundNumber);
    try {
      const cat = await ensureCat();
      const { matches } = await fetchRound(LEAGUE_ID, String(roundNumber), cat);
      const playedMatches = matches.filter(
        (m) =>
          m.played && m.finalScoreHome !== undefined && m.finalScoreAway !== undefined,
      );
      // Pull all history (no category filter) so older saisons can still be validated
      const history = await getPredictionHistory();
      const pending = history.filter(
        (h) => !h.validated && h.roundNumber === roundNumber,
      );

      if (pending.length === 0) {
        toast(
          `Round ${roundNumber} : aucune prédiction sauvegardée pour ce round`,
          { icon: "ℹ️", duration: 4000 },
        );
        return;
      }

      if (playedMatches.length === 0) {
        toast.error(
          `Round ${roundNumber} : aucun score disponible pour le moment.`,
          { duration: 6000 },
        );
        return;
      }

      let validated = 0;
      let notFound = 0;
      for (const m of playedMatches) {
        const pred = pending.find(
          (p) => p.homeTeam === m.homeTeam && p.awayTeam === m.awayTeam,
        );
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
          `Round ${roundNumber} ✓ ${validated} validée(s)${notFound ? ` · ${notFound} sans correspondance` : ""}`,
        );
      } else {
        toast.error(
          `Round ${roundNumber} : aucun match ne correspond à vos prédictions sauvegardées`,
          { duration: 5000 },
        );
      }
    } catch (e) {
      toast.error(`Validation échouée : ${(e as Error).message}`);
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
        toast("Aucune prédiction en attente de validation", { icon: "ℹ️" });
        return;
      }

      const totalPlayed = played.reduce((a, r) => a + r.matches.length, 0);
      if (totalPlayed === 0) {
        toast.error(
          `Aucun score disponible · ${pending.length} prédiction(s) en attente.`,
          { duration: 6000 },
        );
        return;
      }

      let validated = 0;
      for (const r of played) {
        for (const m of r.matches) {
          if (m.finalScoreHome === undefined || m.finalScoreAway === undefined)
            continue;
          const pred = pending.find(
            (p) => p.homeTeam === m.homeTeam && p.awayTeam === m.awayTeam,
          );
          if (pred) {
            await updateModelWeights(pred, {
              home: m.finalScoreHome,
              away: m.finalScoreAway,
            });
            validated++;
          }
        }
      }

      const sts = await scanRoundStatuses(LEAGUE_ID, cat);
      setStatuses(sts);

      if (validated > 0) {
        toast.success(
          `${validated} prédiction(s) auto-validée(s) sur ${pending.length} en attente`,
        );
      } else {
        toast.error(
          `${totalPlayed} match(s) joué(s) trouvé(s) mais aucun ne correspond à vos prédictions`,
          { duration: 6000 },
        );
      }
    } catch (e) {
      toast.error(`Auto-validation échouée : ${(e as Error).message}`);
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
        toast("Aucun round avec résultats", { icon: "ℹ️" });
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
            if (
              existingSet.has(matchKey) ||
              !match.oddsHome ||
              !match.oddsDraw ||
              !match.oddsAway
            )
              continue;
            try {
              const prediction = await predict(
                match.homeTeam,
                match.awayTeam,
                parseFloat(match.oddsHome),
                parseFloat(match.oddsDraw),
                parseFloat(match.oddsAway),
              );
              const id = await savePrediction(
                prediction,
                roundNum,
                match.matchTime,
                cat,
              );
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
        `Entraînement terminé · ${totalImported} matchs · ${totalValidated} validés · ${elapsed}s · Accuracy ${(finalStats.accuracy * 100).toFixed(1)}%`,
        { duration: 8000 },
      );
      setStatus({
        kind: "ok",
        text: `IA entraînée sur ${totalImported} matchs (${totalValidated} validés) · Accuracy ${(finalStats.accuracy * 100).toFixed(1)}% · ${elapsed}s`,
      });
    } catch (e) {
      toast.error(`Entraînement échoué : ${(e as Error).message}`);
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
        toast("Aucune catégorie trouvée", { icon: "ℹ️" });
      } else {
        toast.success(`${cats.length} catégorie(s) trouvée(s)`);
      }
    } catch (e) {
      toast.error(`Échec découverte : ${(e as Error).message}`);
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
    toast.success(`Catégorie : ${newId}`);
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
            Sporty-Tech Live Sync
          </span>
          {activeCat && (
            <>
              <span className="font-mono text-[10px] text-muted-foreground">
                · cat {activeCat}
              </span>
              <span className="border border-lime/60 bg-lime/10 px-1 font-mono text-[9px] uppercase text-lime">
                ACTIVE
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? "✕ Fermer" : "⚙ Avancé"}
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              eventCategoryId
            </label>
            <div className="flex gap-2">
              <input
                value={eventCategoryId}
                onChange={(e) => setEventCategoryIdState(e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== activeCat) handleChangeCategory(v);
                }}
                placeholder="auto-découvert"
                className="flex-1 border border-border bg-background px-3 py-2 font-mono text-sm focus:border-cyan focus:outline-none"
              />
              <button
                type="button"
                onClick={handleDiscoverCategories}
                disabled={discovering}
                className="border border-cyan bg-cyan/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
              >
                {discovering ? "⟳" : "🔍 Découvrir"}
              </button>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              LeagueId : {LEAGUE_ID} ·{" "}
              {availableCategories.length > 0
                ? `${availableCategories.length} trouvée(s)`
                : "Utiliser 'Découvrir' pour scanner les saisons"}
            </p>
          </div>

          {availableCategories.length > 0 && (
            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Catégories disponibles
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
                    <span>{cat.roundCount} matchs/round</span>
                  </button>
                ))}
              </div>
              <p className="font-mono text-[10px] text-warn">
                ⚠ Changer = nouvelle saison. L'historique reste en base.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Round (1-38)
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
                  Round {n}
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
          {loading ? "⟳" : "⬇"} Sync
        </button>
        <button
          type="button"
          onClick={handleScanStatuses}
          disabled={scanning}
          className="self-end border border-border bg-background px-3 py-2 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:bg-panel-hover disabled:opacity-40"
        >
          {scanning ? "⟳" : "🔍"} Scan
        </button>
      </div>

      {fullyPlayedRounds.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Rounds complets disponibles
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
                Entraînement IA en cours...
              </span>
            </div>
            {trainingProgress.total > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>
                    Round {trainingProgress.current}/{trainingProgress.total}
                  </span>
                  <span>{trainingProgress.matchesFound} matchs trouvés</span>
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
            <span>Entraîner l'IA (tous les rounds joués)</span>
          </button>
        )}
        <p className="font-mono text-[10px] text-muted-foreground">
          Importe et valide automatiquement tous les matchs terminés
        </p>
      </div>

      <button
        type="button"
        onClick={handleAutoValidate}
        disabled={validating}
        className="w-full border border-lime bg-lime/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-lime transition-colors hover:bg-lime/20 disabled:opacity-40"
      >
        {validating ? "⟳ Validation…" : "✓ Auto-valider mes prédictions"}
      </button>

      {statuses.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Statuts
            </span>
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-lime" /> Complet
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-warn" /> Partiel
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 bg-border" /> À venir
              </span>
            </div>
          </div>
          <div className="grid grid-cols-10 gap-1">
            {statuses.map((s) => {
              const fully = s.total > 0 && s.played === s.total;
              const partial = s.played > 0 && !fully;
              return (
                <button
                  key={s.round}
                  type="button"
                  onClick={() => setRound(String(s.round))}
                  title={`Round ${s.round} · ${s.played}/${s.total}`}
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
              Aperçu · {preview.length} match{preview.length > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={loadIntoForm}
              className="font-mono text-[10px] uppercase tracking-widest text-cyan hover:opacity-70"
            >
              ⚡ Charger
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
