import React, { useEffect, useState } from "react";
import { getLearningStats, resetWeights, type LearningStats } from "@/lib/cloudLearning";
import toast from "react-hot-toast";

export function LearningDashboard() {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const s = await getLearningStats();
    setStats(s);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleReset() {
    toast(
      (t) => (
        <div className="space-y-2">
          <p className="font-mono text-xs">Reset all model weights to defaults?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                toast.dismiss(t.id);
                await resetWeights();
                load();
                toast.success("Weights reset to default");
              }}
              className="bg-danger px-3 py-1 font-mono text-[10px] uppercase text-foreground"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="border border-border px-3 py-1 font-mono text-[10px] uppercase"
            >
              Cancel
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
        Loading neural telemetry…
      </div>
    );
  }

  const recommendations: string[] = [];
  if (stats.totalMatches < 10)
    recommendations.push(
      "Validate more matches — the AI needs ≥10 results to calibrate.",
    );
  if (stats.recentAccuracy < 0.4 && stats.totalMatches >= 10)
    recommendations.push("Recent accuracy low — model is regressing toward defaults.");
  if (stats.weights.drawBias > 1.05)
    recommendations.push("Draw bias is elevated. Watch for over-prediction of nuls.");
  if (stats.trapTeams.length > 2)
    recommendations.push("Several trap teams detected. Penalties applied automatically.");
  if (recommendations.length === 0)
    recommendations.push("System is in nominal range. Continue logging results.");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Validated" value={String(stats.validated)} accent="cyan" />
        <Metric
          label="Accuracy"
          value={`${(stats.accuracy * 100).toFixed(0)}%`}
          accent="lime"
        />
        <Metric
          label="Recent (10)"
          value={`${(stats.recentAccuracy * 100).toFixed(0)}%`}
          accent="warn"
        />
        <Metric
          label="Exact score"
          value={`${(stats.scoreAccuracy * 100).toFixed(0)}%`}
          accent="cyan"
        />
      </div>

      <div className="space-y-2 border border-border bg-panel p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
            Model Weights
          </h3>
          <button
            type="button"
            onClick={handleReset}
            className="font-mono text-[10px] uppercase tracking-widest text-danger hover:opacity-70"
          >
            Reset
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
          title="Trap teams"
          subtitle="Favs that disappoint"
          items={stats.trapTeams.map(
            (t) => `${t.team_name} · ${t.trap_count}/${t.total_matches}`,
          )}
          accent="warn"
        />
        <TeamList
          title="Overperformers"
          subtitle="Outsiders that surprise"
          items={stats.overperformTeams.map(
            (t) => `${t.team_name} · +${t.overperform_count}`,
          )}
          accent="lime"
        />
        <TeamList
          title="Avoid"
          subtitle="High trap rate"
          items={stats.avoidTeams.map((t) => `${t.team_name}`)}
          accent="danger"
        />
      </div>

      <div className="space-y-1 border border-border bg-panel p-4">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-cyan">
          AI Recommendations
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
  items,
  accent,
}: {
  title: string;
  subtitle: string;
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
        <p className="font-mono text-[10px] text-muted-foreground">— none —</p>
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
