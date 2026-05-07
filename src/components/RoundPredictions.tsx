import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, RotateCw, Settings2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchRound,
  formatMatchTime,
  discoverCategory,
  type SportyMatch,
} from "@/lib/sportyApi";
import { predict, type PredictionResult } from "@/lib/prediction";
import {
  savePrediction,
  getPredictionHistory,
  updateModelWeights,
} from "@/lib/cloudLearning";
import { getUserConfig, setEventCategoryId as persistEventCategoryId } from "@/lib/userConfig";
import { MatchPredictionCard } from "./MatchPredictionCard";
import { cn } from "@/lib/utils";

const LEAGUE_ID = "8035";
const CAT_KEY = "sporty.eventCategoryId";
const ROUND_KEY = "sporty.round";
const TOTAL_ROUNDS = 38;

interface Row {
  match: SportyMatch;
  prediction: PredictionResult | null;
}

interface Props {
  onToggleAdvanced?: () => void;
  showAdvancedButton?: boolean;
}

export function RoundPredictions({ onToggleAdvanced, showAdvancedButton = true }: Props) {
  const [round, setRound] = useState<number>(() => {
    const v = Number(localStorage.getItem(ROUND_KEY));
    return v >= 1 && v <= TOTAL_ROUNDS ? v : 1;
  });
  const [categoryId, setCategoryId] = useState<string>(
    () => localStorage.getItem(CAT_KEY) ?? "",
  );
  const [editCat, setEditCat] = useState(false);
  const [catInput, setCatInput] = useState(categoryId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [alreadyPredicted, setAlreadyPredicted] = useState(false);

  // Init category: prefer cloud config, fall back to localStorage / discovery
  useEffect(() => {
    (async () => {
      try {
        const config = await getUserConfig();
        if (config.eventCategoryId) {
          setCategoryId(config.eventCategoryId);
          localStorage.setItem(CAT_KEY, config.eventCategoryId);
          setCatInput(config.eventCategoryId);
          return;
        }
        const local = localStorage.getItem(CAT_KEY);
        if (local) return;
        const id = await discoverCategory(LEAGUE_ID);
        if (id) {
          setCategoryId(id);
          setCatInput(id);
          localStorage.setItem(CAT_KEY, id);
          await persistEventCategoryId(id);
        }
      } catch {
        /* silent */
      }
    })();
  }, []);

  const loadAndPredict = useCallback(
    async (r: number, cat: string, forceRecompute = false) => {
      setLoading(true);
      setAlreadyPredicted(false);
      try {
        const { matches, eventCategoryId: discovered } = await fetchRound(
          LEAGUE_ID,
          String(r),
          cat || undefined,
        );
        if (!cat && discovered) {
          setCategoryId(discovered);
          localStorage.setItem(CAT_KEY, discovered);
          await persistEventCategoryId(discovered).catch(() => {});
        }
        const usedCat = cat || discovered;

        // Ensure each match has a matchTime so the countdown can render
        const nowIso = new Date().toISOString();
        const limited = matches.slice(0, 10).map((m) => ({
          ...m,
          matchTime: m.matchTime || nowIso,
        }));

        // Reuse existing predictions for this round if any
        let computed: Row[] = [];
        const existing = await getPredictionHistory(usedCat).catch(() => []);
        const existingForRound = existing.filter((p) => p.roundNumber === r);

        if (existingForRound.length > 0 && !forceRecompute) {
          computed = limited.map((m) => {
            const pred =
              existingForRound.find(
                (p) => p.homeTeam === m.homeTeam && p.awayTeam === m.awayTeam,
              ) ?? null;
            return { match: m, prediction: pred };
          });
          setAlreadyPredicted(true);
        } else {
          computed = await Promise.all(
            limited.map(async (m) => {
              const oh = parseFloat(m.oddsHome);
              const od = parseFloat(m.oddsDraw);
              const oa = parseFloat(m.oddsAway);
              if (!oh || !od || !oa) return { match: m, prediction: null };
              try {
                const prediction = await predict(m.homeTeam, m.awayTeam, oh, od, oa);
                savePrediction(prediction, r, m.matchTime, usedCat).catch(() => {});
                return { match: m, prediction };
              } catch {
                return { match: m, prediction: null };
              }
            }),
          );
        }

        setRows(computed);

        // Silent auto-validation for played matches with un-validated predictions
        for (const row of computed) {
          if (
            row.match.played &&
            row.prediction &&
            !row.prediction.validated &&
            typeof row.match.finalScoreHome === "number" &&
            typeof row.match.finalScoreAway === "number"
          ) {
            updateModelWeights(row.prediction, {
              home: row.match.finalScoreHome,
              away: row.match.finalScoreAway,
            })
              .then(() => {
                row.prediction!.validated = true;
              })
              .catch(() => {});
          }
        }

        if (computed.length === 0) {
          toast.error("Aucun match trouvé pour ce round");
        }
      } catch (e) {
        toast.error(`Erreur de chargement : ${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-load on round / category change
  useEffect(() => {
    if (!categoryId) return;
    loadAndPredict(round, categoryId);
    localStorage.setItem(ROUND_KEY, String(round));
  }, [round, categoryId, loadAndPredict]);

  const roundTime = formatMatchTime(rows.find((r) => r.match.matchTime)?.match.matchTime);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="space-y-3 border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Virtual English League · bet261.mg
            </div>
            <div className="text-lg font-bold text-foreground">
              Round {round}
              <span className="text-muted-foreground"> / {TOTAL_ROUNDS}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Heure de début
            </div>
            <div className="tabular-nums font-mono text-base font-bold text-cyan">
              {roundTime || "--:--"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRound((r) => Math.max(1, r - 1))}
            disabled={round <= 1 || loading}
            className="border border-border bg-background p-1.5 text-foreground hover:bg-panel disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            disabled={loading}
            className="border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          >
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Round {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setRound((r) => Math.min(TOTAL_ROUNDS, r + 1))}
            disabled={round >= TOTAL_ROUNDS || loading}
            className="border border-border bg-background p-1.5 text-foreground hover:bg-panel disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => loadAndPredict(round, categoryId)}
            disabled={loading}
            className="flex items-center gap-1 border border-cyan bg-cyan/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-cyan hover:bg-cyan/20 disabled:opacity-40"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            {loading ? "Chargement…" : "Charger"}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Saison :
            </span>
            {editCat ? (
              <>
                <input
                  value={catInput}
                  onChange={(e) => setCatInput(e.target.value.replace(/\D/g, ""))}
                  className="h-7 w-28 border border-border bg-background px-2 font-mono text-xs"
                  placeholder="ex: 144128"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setCategoryId(catInput);
                    localStorage.setItem(CAT_KEY, catInput);
                    await persistEventCategoryId(catInput).catch(() => {});
                    setEditCat(false);
                    setRound(1);
                    toast.success("Saison mise à jour");
                  }}
                  className="border border-lime px-2 py-0.5 font-mono text-[10px] text-lime"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditCat(false);
                    setCatInput(categoryId);
                  }}
                  className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  Annuler
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditCat(true)}
                className="flex items-center gap-1 border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-foreground hover:bg-panel"
              >
                {categoryId || "auto"}
                <Settings2 className="h-3 w-3" />
              </button>
            )}
            {showAdvancedButton && onToggleAdvanced && (
              <button
                type="button"
                onClick={onToggleAdvanced}
                className="border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Paramètres avancés
              </button>
            )}
          </div>
        </div>

        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {rows.filter((r) => r.prediction).length} prédiction
          {rows.filter((r) => r.prediction).length > 1 ? "s" : ""} · {rows.length} match
          {rows.length > 1 ? "s" : ""}
        </div>
      </div>

      {/* Predictions grid */}
      {loading && rows.length === 0 ? (
        <div className="border border-border bg-panel p-6 text-center font-mono text-xs text-muted-foreground">
          Chargement des prédictions…
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border bg-panel p-6 text-center font-mono text-xs text-muted-foreground">
          Aucun match pour ce round.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r, i) => (
            <MatchPredictionCard key={i} match={r.match} prediction={r.prediction} />
          ))}
        </div>
      )}
    </div>
  );
}
