import React from "react";
import { TEAMS } from "@/lib/prediction";
import { cn } from "@/lib/utils";

interface TeamSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  excludeTeam?: string;
  disabledTeams?: string[];
}

export function TeamSelect({
  label,
  value,
  onChange,
  excludeTeam,
  disabledTeams = [],
}: TeamSelectProps) {
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
          return (
            <option key={t} value={t} disabled={disabled}>
              {t}
              {disabled ? " ✕" : ""}
            </option>
          );
        })}
      </select>
    </div>
  );
}
