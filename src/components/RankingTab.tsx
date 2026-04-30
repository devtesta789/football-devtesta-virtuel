import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchAllPlayedMatches, discoverCategory } from "@/lib/sportyApi";
import { getUserConfig } from "@/lib/userConfig";
import { computeTeamStats, saveTeamStatsToStorage, type TeamStats } from "@/lib/teamRanking";
import { cn } from "@/lib/utils";

const LEAGUE_ID = "8035";
const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000; // refresh every 2 minutes

function formatFormIcons(recentForm: string) {
  return recentForm.split("").map((symbol, index) => {
    if (symbol === "W") {
      return (
        <span key={index} className="mx-0.5 text-base font-bold text-emerald-500">
          ✓
        </span>
      );
    }
    if (symbol === "D") {
      return (
        <span key={index} className="mx-0.5 text-base font-bold text-slate-400">
          -
        </span>
      );
    }
    return (
      <span key={index} className="mx-0.5 text-base font-bold text-rose-500">
        ×
      </span>
    );
  });
}

export function RankingTab() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<TeamStats[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventCategory, setEventCategory] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const resolveEventCategoryId = useCallback(async () => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("sporty.eventCategoryId") : null;
    if (stored) return stored;

    const config = await getUserConfig();
    if (config.eventCategoryId) return config.eventCategoryId;

    const discovered = await discoverCategory(LEAGUE_ID);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sporty.eventCategoryId", discovered);
    }
    return discovered;
  }, []);

  const loadRanking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventCategoryId = await resolveEventCategoryId();
      if (typeof window !== "undefined" && eventCategoryId) {
        window.localStorage.setItem("sporty.eventCategoryId", eventCategoryId);
      }
      setEventCategory(eventCategoryId);

      const playedRounds = await fetchAllPlayedMatches(LEAGUE_ID, eventCategoryId);
      const allMatches = playedRounds.flatMap((round) => round.matches);
      const ranking = computeTeamStats(allMatches);
      saveTeamStatsToStorage(Object.fromEntries(ranking.map((row) => [row.teamName, row])));
      setStats(ranking);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError((err as Error)?.message ?? "Erreur de classement");
    } finally {
      setLoading(false);
    }
  }, [resolveEventCategoryId]);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadRanking();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadRanking]);

  if (loading) {
    return (
      <div className="rounded border border-border bg-panel p-4 text-center text-sm text-muted-foreground">
        {t("ranking.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-danger bg-danger/10 p-4 text-sm text-danger">
        {t("ranking.error")}: {error}
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <div className="rounded border border-border bg-panel p-4 text-sm text-muted-foreground">
        {t("ranking.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-panel p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-bold text-foreground">{t("ranking.title")}</div>
            <div className="text-xs text-muted-foreground">
              {t("ranking.subtitle")}
            </div>
            {lastSyncedAt ? (
              <div className="text-[11px] text-muted-foreground">
                Dernière synchronisation : {lastSyncedAt.toLocaleTimeString()}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {eventCategory && (
              <div className="rounded border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("ranking.eventCategory")}: {eventCategory}
              </div>
            )}
            <button
              type="button"
              onClick={loadRanking}
              disabled={loading}
              className="rounded border border-cyan bg-cyan/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-40"
            >
              {loading ? "⟳" : "↻"} {t("ranking.refresh")}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-background">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-panel text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t("ranking.team")}</th>
              <th className="px-3 py-2">PTS</th>
              <th className="px-3 py-2">W-D-L</th>
              <th className="px-3 py-2">GF-GA</th>
              <th className="px-3 py-2">GD</th>
              <th className="px-4 py-2">{t("ranking.home")}</th>
              <th className="px-3 py-2">{t("ranking.away")}</th>
              <th className="px-3 py-2">{t("ranking.form")}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row, index) => (
              <tr key={row.teamName} className={cn(index % 2 === 0 ? "bg-background" : "bg-panel")}> 
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-foreground">{row.teamName}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.points}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.wins}-{row.draws}-{row.losses}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.goalsFor}-{row.goalsAgainst}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.goalDiff}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.homeWins}-{row.homeDraws}-{row.homeLosses}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {row.awayWins}-{row.awayDraws}-{row.awayLosses}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-cyan">
                  {row.recentForm ? formatFormIcons(row.recentForm) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-border bg-panel p-4 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Légende</div>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-semibold">PTS</span> : points
          </div>
          <div>
            <span className="font-semibold">W-D-L</span> : victoires - matchs nuls - défaites
          </div>
          <div>
            <span className="font-semibold">GF-GA</span> : buts pour - buts contre
          </div>
          <div>
            <span className="font-semibold">GD</span> : différence de buts
          </div>
        </div>
      </div>
    </div>
  );
}
