import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getLearningStats,
  resetWeights,
  invalidateCache,
  type LearningStats,
} from "@/lib/cloudLearning";
import toast from "react-hot-toast";

export function LearningDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    invalidateCache();
    const s = await getLearningStats();
    setStats(s);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReset() {
    toast(
      (tt) => (
        <div className="space-y-2">
          <p className="font-mono text-xs">{t("ai.resetConfirm")}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {t("ai.resetAdvice")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                toast.dismiss(tt.id);
                await resetWeights();
                invalidateCache();
                load();
                toast.success(t("ai.resetDone"), { duration: 5000 });
                setTimeout(() => {
                  toast(t("ai.resetReminder"), {
                    icon: "🧠",
                    duration: 8000,
                  });
                }, 1500);
              }}
              className="bg-danger px-3 py-1 font-mono text-[10px] uppercase text-foreground"
            >
              {t("ai.confirm")}
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(tt.id)}
              className="border border-border px-3 py-1 font-mono text-[10px] uppercase"
            >
              {t("ai.cancel")}
            </button>
          </div>
        </div>
      ),
      { duration: Infinity },
    );
  }

  if (loading || !stats) {
    return (
      <div className="p-8 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {t("ai.loading")}
      </div>
    );
  }

  // Detect if weights are stuck at the limits
  const drawBiasAtMax = stats.weights.drawBias >= 1.28;
  const lambdaAtMax = stats.weights.lambdaBoost >= 1.55;
  const homeAdvAtMin = stats.weights.homeAdvantage <= 0.87;
  const antiTrapAtMax = stats.weights.antiTrapStrength >= 1.55;
  const weightsAtLimitCount = [
    drawBiasAtMax,
    lambdaAtMax,
    homeAdvAtMin,
    antiTrapAtMax,
  ].filter(Boolean).length;
  const weightsStuck = weightsAtLimitCount >= 2;

  const recommendations: string[] = [];
  if (weightsAtLimitCount >= 2)
    recommendations.push(t("ai.recWeightsStuck"));
  if (stats.nulPredicted === 0)
    recommendations.push(t("ai.recNoDraws"));
  else if (stats.nulAccuracy < 0.35 && stats.nulPredicted > 0)
    recommendations.push(t("ai.recLowDrawAccuracy"));
  else if (stats.nulAccuracy >= 0.5)
    recommendations.push(t("ai.recDrawsGood"));
  if (lambdaAtMax && weightsAtLimitCount < 2)
    recommendations.push(t("ai.recLambdaMax"));
  if (homeAdvAtMin && weightsAtLimitCount < 2)
    recommendations.push(t("ai.recHomeAdvMin"));
  if (stats.domAccuracy < 0.5 && stats.validated > 20)
    recommendations.push(t("ai.recLowDomAccuracy"));
  if (stats.totalMatches < 10)
    recommendations.push(t("ai.recValidateMore"));
  if (stats.recentAccuracy < 0.4 && stats.totalMatches >= 10)
    recommendations.push(t("ai.recLowAccuracy"));
  if (stats.trapTeams.length > 3) recommendations.push(t("ai.recTrapTeams"));
  if (recommendations.length === 0) recommendations.push(t("ai.recNominal"));

  const domPredictedCount =
    stats.validated - stats.nulPredicted - stats.extPredicted;

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-cyan">
          {t("ai.dashboard")}
        </h2>
        <button
          type="button"
          onClick={load}
          className="border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-cyan hover:text-cyan"
        >
          ↻ {t("ai.refresh")}
        </button>
      </div>

      {/* Weights stuck banner */}
      {weightsStuck && (
        <div className="flex items-center justify-between gap-3 border border-danger/60 bg-danger/10 p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base text-danger">⚠</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-danger">
              {t("ai.weightsStuck")}
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="border border-danger bg-danger/20 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-danger transition-colors hover:bg-danger/30"
          >
            {t("ai.resetNow")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("ai.validated")} value={String(stats.validated)} accent="cyan" />
        <Metric
          label={t("ai.accuracy")}
          value={`${(stats.accuracy * 100).toFixed(0)}%`}
          accent="lime"
        />
        <Metric
          label={t("ai.recent")}
          value={`${(stats.recentAccuracy * 100).toFixed(0)}%`}
          accent="warn"
        />
        <Metric
          label={t("ai.exactScore")}
          value={`${(stats.scoreAccuracy * 100).toFixed(0)}%`}
          accent="cyan"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <OutcomeCard
          label="DOM (1)"
          predicted={domPredictedCount}
          accuracy={stats.domAccuracy}
          accent="cyan"
        />
        <OutcomeCard
          label="NUL (X)"
          predicted={stats.nulPredicted}
          accuracy={stats.nulAccuracy}
          missed={stats.missedDraws}
          accent="warn"
          alert={stats.nulPredicted === 0}
        />
        <OutcomeCard
          label="EXT (2)"
          predicted={stats.extPredicted}
          accuracy={stats.extAccuracy}
          accent="lime"
        />
      </div>

      <div className="space-y-2 border border-border bg-panel p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
            {t("ai.modelWeights")}
          </h3>
          <button
            type="button"
            onClick={handleReset}
            className="font-mono text-[10px] uppercase tracking-widest text-danger hover:opacity-70"
          >
            {t("ai.reset")}
          </button>
        </div>
        <div className="space-y-2">
          {Object.entries(stats.weights).map(([k, v]) => (
            <WeightBar key={k} name={k} value={v} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TeamList
          title={t("ai.trapTeams")}
          subtitle={t("ai.trapSubtitle")}
          emptyLabel={t("ai.none")}
          items={stats.trapTeams.map(
            (tt) => `${tt.team_name} · ${tt.trap_count}/${tt.total_matches}`,
          )}
          accent="warn"
        />
        <TeamList
          title={t("ai.overperformers")}
          subtitle={t("ai.overperformSubtitle")}
          emptyLabel={t("ai.none")}
          items={stats.overperformTeams.map(
            (tt) => `${tt.team_name} · +${tt.overperform_count}`,
          )}
          accent="lime"
        />
        <TeamList
          title={t("ai.avoid")}
          subtitle={t("ai.avoidSubtitle")}
          emptyLabel={t("ai.none")}
          items={stats.avoidTeams.map((tt) => `${tt.team_name}`)}
          accent="danger"
        />
      </div>

      <div className="space-y-1 border border-border bg-panel p-4">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
          {t("ai.recommendations")}
        </h3>
        <ul className="space-y-1">
          {recommendations.map((r, i) => (
            <li key={i} className="font-mono text-xs text-foreground">
              › {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OutcomeCard({
  label,
  predicted,
  accuracy,
  missed,
  accent,
  alert = false,
}: {
  label: string;
  predicted: number;
  accuracy: number;
  missed?: number;
  accent: string;
  alert?: boolean;
}) {
  const borderClass = alert
    ? "border-danger/60"
    : accent === "cyan"
      ? "border-cyan/40"
      : accent === "warn"
        ? "border-warn/40"
        : "border-lime/40";
  const textClass = alert
    ? "text-danger"
    : accent === "cyan"
      ? "text-cyan"
      : accent === "warn"
        ? "text-warn"
        : "text-lime";
  const { t } = useTranslation();
  return (
    <div className={`border ${borderClass} bg-panel p-3 space-y-1`}>
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`tabular-nums font-mono text-xl font-bold ${textClass}`}>
        {predicted > 0 ? `${(accuracy * 100).toFixed(0)}%` : "—"}
      </div>
      <div className="font-mono text-[10px] text-muted-foreground">
        {predicted} {t("ai.predicted")}
      </div>
      {missed !== undefined && missed > 0 && (
        <div className="font-mono text-[10px] text-danger">
          ⚠ {missed} {t("ai.missed")}
        </div>
      )}
      {alert && predicted === 0 && (
        <div className="font-mono text-[9px] text-danger uppercase tracking-widest">
          ⚠ {t("ai.neverPredicted")}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = "foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  const colorClass =
    accent === "cyan"
      ? "text-cyan"
      : accent === "lime"
        ? "text-lime"
        : accent === "warn"
          ? "text-warn"
          : "text-foreground";
  return (
    <div className="border border-border bg-panel p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`tabular-nums font-mono text-xl font-bold ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function WeightBar({ name, value }: { name: string; value: number }) {
  const pct = Math.min(100, (value / 1.5) * 100);
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px]">
        <span className="capitalize text-muted-foreground">
          {name.replace(/([A-Z])/g, " $1").trim()}
        </span>
        <span className="tabular-nums text-foreground">{value.toFixed(3)}</span>
      </div>
      <div className="mt-1 h-1 w-full bg-background">
        <div className="h-1 bg-cyan" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TeamList({
  title,
  subtitle,
  emptyLabel,
  items,
  accent,
}: {
  title: string;
  subtitle: string;
  emptyLabel: string;
  items: string[];
  accent: string;
}) {
  const colorClass =
    accent === "warn"
      ? "text-warn border-warn/40"
      : accent === "lime"
        ? "text-lime border-lime/40"
        : "text-danger border-danger/40";
  return (
    <div className={`space-y-1 border ${colorClass} bg-panel p-3`}>
      <h4 className={`font-mono text-[10px] font-bold uppercase tracking-widest`}>
        {title}
      </h4>
      <p className="font-mono text-[9px] text-muted-foreground">{subtitle}</p>
      {items.length === 0 ? (
        <p className="font-mono text-[10px] text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="font-mono text-[11px] text-foreground">
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
