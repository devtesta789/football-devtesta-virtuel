import React, { useEffect, useState, useRef } from "react";
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

function ReliabilityDot({ r }: { r: TeamReliability | undefined }) {
  if (!r)
    return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />;
  const color = r === "high" ? "bg-lime" : r === "medium" ? "bg-warn" : "bg-danger";
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", color)} />;
}

export function TeamSelect({
  label,
  value,
  onChange,
  excludeTeam,
  disabledTeams = [],
}: TeamSelectProps) {
  const [reliability, setReliability] = useState<Record<string, TeamReliability>>({});
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getTeamReliability().then(setReliability);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredTeams = TEAMS.filter((t) => t.toLowerCase().includes(search.toLowerCase()));

  const selectedRel = value ? reliability[value] : undefined;

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between gap-2",
          "border border-border bg-background px-3 py-2 text-left",
          "font-mono text-sm text-foreground transition-colors",
          "focus:border-cyan focus:outline-none",
          open && "border-cyan",
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {value ? (
            <>
              <ReliabilityDot r={selectedRel} />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">— Select team —</span>
          )}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border border-cyan bg-panel shadow-lg">
          <div className="sticky top-0 border-b border-border bg-panel p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:border-cyan focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
              setSearch("");
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 font-mono text-xs text-muted-foreground hover:bg-panel-hover"
          >
            — Select team —
          </button>

          {filteredTeams.map((t) => {
            const disabled = t === excludeTeam || disabledTeams.includes(t);
            const rel = reliability[t];
            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!disabled) {
                    onChange(t);
                    setOpen(false);
                    setSearch("");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors",
                  disabled
                    ? "cursor-not-allowed text-muted-foreground opacity-40"
                    : "text-foreground hover:bg-panel-hover",
                  t === value && "bg-cyan/10 text-cyan",
                )}
              >
                <ReliabilityDot r={rel} />
                <span className="truncate">{t}</span>
                {disabled && <span className="ml-auto font-mono text-[10px] text-danger">✕</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
