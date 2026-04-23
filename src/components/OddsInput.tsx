import React from "react";

interface OddsInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent?: "cyan" | "lime" | "warn";
}

export function OddsInput({ label, value, onChange, accent = "cyan" }: OddsInputProps) {
  const accentClass =
    accent === "lime"
      ? "focus:border-lime"
      : accent === "warn"
        ? "focus:border-warn"
        : "focus:border-cyan";

  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        step="0.01"
        min="1.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={`tabular-nums border border-border bg-background px-3 py-2 font-mono text-sm font-bold text-foreground transition-colors focus:outline-none ${accentClass}`}
      />
    </div>
  );
}
