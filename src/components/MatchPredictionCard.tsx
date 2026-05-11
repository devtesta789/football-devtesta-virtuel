import { Countdown } from "./Countdown";
import { cn } from "@/lib/utils";
import type { PredictionResult } from "@/lib/prediction";
import type { SportyMatch } from "@/lib/sportyApi";
import { formatMatchTime } from "@/lib/sportyApi";
import { trendSymbol, type TeamOddsHistory } from "@/lib/rankings";

interface Props {
  match: SportyMatch;
  prediction: PredictionResult | null;
  homeTrend?: TeamOddsHistory;
  awayTrend?: TeamOddsHistory;
}

export function MatchPredictionCard({ match, prediction }: Props) {
  const time = formatMatchTime(match.matchTime);
  const finalStr =
    typeof match.finalScoreHome === "number" && typeof match.finalScoreAway === "number"
      ? `${match.finalScoreHome}-${match.finalScoreAway}`
      : null;

  let resultOk: boolean | null = null;
  if (prediction && finalStr) {
    const realLabel =
      match.finalScoreHome! > match.finalScoreAway!
        ? "1"
        : match.finalScoreHome! < match.finalScoreAway!
          ? "2"
          : "X";
    resultOk = realLabel === prediction.winnerLabel;
  }

  const tierColor =
    prediction?.confidenceTier === "SAFE"
      ? "text-lime border-lime"
      : prediction?.confidenceTier === "MEDIUM"
        ? "text-cyan border-cyan"
        : "text-warn border-warn";

  return (
    <div className="space-y-3 border border-border bg-panel p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        {prediction ? (
          <span
            className={cn(
              "border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest",
              tierColor,
            )}
          >
            {prediction.confidenceTier} · {prediction.confidence.toFixed(0)}%
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            Pas de cotes
          </span>
        )}
        <div className="flex items-center gap-2">
          {time && (
            <span className="font-mono text-[10px] text-muted-foreground">🕐 {time}</span>
          )}
          {!match.played && <Countdown iso={match.matchTime} />}
        </div>
      </div>

      {/* Teams + odds */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="truncate text-xs font-bold text-foreground">{match.homeTeam}</div>
          <div className="tabular-nums font-mono text-sm text-cyan">{match.oddsHome || "—"}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-muted-foreground">X</div>
          <div className="tabular-nums font-mono text-sm text-cyan">{match.oddsDraw || "—"}</div>
        </div>
        <div>
          <div className="truncate text-xs font-bold text-foreground">{match.awayTeam}</div>
          <div className="tabular-nums font-mono text-sm text-cyan">{match.oddsAway || "—"}</div>
        </div>
      </div>

      {/* Prediction */}
      {prediction && (
        <div className="border border-border bg-background p-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Prédiction
              </div>
              <div className="tabular-nums font-mono text-lg font-bold text-cyan">
                {prediction.scoreHome}-{prediction.scoreAway}
                <span className="ml-2 text-xs text-foreground">({prediction.winnerLabel})</span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Vainqueur
              </div>
              <div className="text-xs font-bold text-foreground">{prediction.winner}</div>
            </div>
          </div>
          {prediction.valueBet && prediction.valueBetType && (
            <div className="mt-2 border-t border-border pt-2 font-mono text-[10px] text-lime">
              💎 Value bet : {prediction.valueBetMarket}
            </div>
          )}
        </div>
      )}

      {/* Final result */}
      {match.played && finalStr ? (
        <div className="flex items-center justify-between border border-border bg-background p-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Score final
          </span>
          <div className="flex items-center gap-2">
            {resultOk !== null && (
              <span
                className={cn(
                  "font-mono text-[10px] font-bold",
                  resultOk ? "text-lime" : "text-danger",
                )}
              >
                {resultOk ? "✓ correct" : "✗ raté"}
              </span>
            )}
            <span className="tabular-nums font-mono text-sm font-bold text-foreground">
              {finalStr}
            </span>
          </div>
        </div>
      ) : (
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          ⏳ En attente du résultat
        </div>
      )}
    </div>
  );
}
