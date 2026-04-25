import React, { useEffect, useState } from "react";
import { TEAMS } from "@/lib/prediction";
import { getTeamReliability, type TeamReliability } from "@/lib/cloudLearning";
import { cn } from "@/lib/utils";

interface TeamSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  excludeTeam?: string;
  disabledTeams?: string[];
}

function relDot(r: TeamReliability | undefined): string {
  if (r === "low") return "🔴";
  if (r === "medium") return "🟡";
  if (r === "high") return "🟢";
  return "";
}

export function TeamSelect({
  label,
  value,
  onChange,
  excludeTeam,
  disabledTeams = [],
}: TeamSelectProps) {
  const [reliability, setReliability] = useState<Record<string, TeamReliability>>({});

  useEffect(() => {
    getTeamReliability().then(setReliability);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "border border-border bg-background px-3 py-2 text-sm font-medium text-foreground",
          "transition-colors focus:border-cyan focus:outline-none",
        )}
      >
        <option value="">— Select team —</option>
        {TEAMS.map((t) => {
          const disabled = t === excludeTeam || disabledTeams.includes(t);
          const dot = relDot(reliability[t]);
          return (
            <option key={t} value={t} disabled={disabled}>
              {dot ? `${dot} ` : ""}
              {t}
              {disabled ? " ✕" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
