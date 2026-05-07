import { useEffect, useState } from "react";

interface Props {
  iso?: string;
}

function diff(target: number): string {
  const ms = target - Date.now();
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function Countdown({ iso }: Props) {
  const target = iso ? new Date(iso).getTime() : NaN;
  const [text, setText] = useState(() => (isNaN(target) ? "" : diff(target)));

  useEffect(() => {
    if (isNaN(target)) return;
    setText(diff(target));
    const id = setInterval(() => setText(diff(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!iso || isNaN(target)) return null;
  const started = target - Date.now() <= 0;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-cyan/10 px-2 py-0.5 font-mono text-[10px] font-medium text-cyan">
      ⏱ {started ? "En cours" : text}
    </span>
  );
}
