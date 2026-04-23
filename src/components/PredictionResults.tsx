import React from "react";
import type { PredictionResult } from "@/lib/prediction";
import { cn } from "@/lib/utils";

interface Props {
  result: PredictionResult;
  onValidated?: (r: PredictionResult) => void;
}

export function PredictionResults({ result }: Props) {
  const validated = !!result.validated;
  const realH = result.realScoreHome;
  const realA = result.realScoreAway;

  const tierBadge =
    result.confidenceTier === "SAFE"
      ? "text-lime border-lime"
      : result.confidenceTier === "MEDIUM"
        ? "text-cyan border-cyan"
        : "text-warn border-warn";

  const exactScoreCorrect =
    validated && realH === result.scoreHome && realA === result.scoreAway;

  return (
    <div className="space-y-4 border border-border bg-panel p-4 animate-in">
      {/* Header tier + confidence */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest",
            tierBadge,
          )}
        >
          {result.confidenceTier} · {result.confidenceStars}★
        </span>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Confidence
          </div>
          <div className="tabular-nums font-mono text-lg font-bold text-foreground">
            {result.confidence.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Hot/Risky tags */}
      {(result.hotMatch || result.risky) && (
        <div className="flex gap-2">
          {result.hotMatch && (
            <span className="border border-warn px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-warn">
              🔥 Hot match
            </span>
          )}
          {result.risky && (
            <span className="border border-danger px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-danger">
              ⚠ Risky
            </span>
          )}
        </div>
      )}

      {/* Score grid */}
      <div className="grid grid-cols-3 items-center gap-3 border border-border p-3">
        <div className="text-left">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Home
          </div>
          <div className="text-sm font-bold text-foreground">{result.homeTeam}</div>
        </div>
        <div className="text-center">
          <div className="tabular-nums font-mono text-3xl font-bold text-cyan">
            {result.scoreHome}:{result.scoreAway}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            → {result.winner}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Away
          </div>
          <div className="text-sm font-bold text-foreground">{result.awayTeam}</div>
        </div>
      </div>

      {/* Value bet */}
      {result.valueBet && result.valueBetType && (
        <div className="flex items-center justify-between border border-lime bg-lime/5 p-3">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-lime">
              💎 Value Edge Detected
            </div>
            <div className="font-mono text-xs text-foreground">
              Market: {result.valueBetMarket}
            </div>
          </div>
          <div className="tabular-nums font-mono text-lg font-bold text-lime">
            +
            {(
              (result.valueBetType === "DOM"
                ? result.pDOM
                : result.valueBetType === "EXT"
                  ? result.pEXT
                  : result.pNUL) *
                100 -
              (1 /
                (result.valueBetType === "DOM"
                  ? result.oddsHome
                  : result.valueBetType === "EXT"
                    ? result.oddsAway
                    : result.oddsDraw)) *
                100
            ).toFixed(1)}
            %
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <Cell label="HT" value={`${result.htHome}-${result.htAway}`} />
        <Cell label="HT/FT" value={result.htft} />
        <Cell label="O/U" value={result.overUnder} />
        <Cell label="DC" value={result.doubleChance} />
        <Cell label="λ H" value={result.lambdaHome.toFixed(2)} />
        <Cell label="λ A" value={result.lambdaAway.toFixed(2)} />
      </div>

      {/* Top scores */}
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Top 3 probable scores
        </div>
        <div className="grid grid-cols-3 gap-2">
          {result.topScores.map((s, i) => {
            const isReal =
              validated &&
              realH !== undefined &&
              realA !== undefined &&
              s.score === `${realH}-${realA}`;
            return (
              <div
                key={i}
                className={cn(
                  "border bg-background p-2 text-center",
                  isReal ? "border-lime" : "border-border",
                )}
              >
                <div className="tabular-nums font-mono text-sm font-bold text-foreground">
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

      {validated && (
        <div className="border border-lime/40 bg-lime/5 p-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Real result
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-mono text-sm font-bold text-foreground">
                {realH}-{realA}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest",
                  exactScoreCorrect ? "text-lime" : "text-muted-foreground",
                )}
              >
                {exactScoreCorrect ? "Exact ✓" : "Logged"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-background p-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="tabular-nums font-mono text-xs font-bold text-foreground">
        {value}
      </div>
    </div>
  );
}
