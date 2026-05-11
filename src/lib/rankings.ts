import type { PredictionResult } from "./prediction";

export type OddsTrend = "up" | "down" | "stable";

export interface TeamOddsHistory {
  team: string;
  /** Cotes des derniers matchs (du plus ancien au plus récent), côté de l'équipe. */
  recent: number[];
  /** Dernière cote connue. */
  last: number;
  /** Avant-dernière cote (pour affichage `prev → last`). */
  prev: number;
  /** Tendance: `down` = la cote baisse (équipe devient plus favorite), `up` = la cote monte. */
  trend: OddsTrend;
}

export interface MomentumAnalysis {
  /** Outsiders dangereux: ≥3 victoires avec cote > 3.00. */
  dangerous: string[];
  /** Favoris fragiles: ≥2 défaites avec cote < 1.50. */
  fragile: string[];
}

const STABLE_THRESHOLD = 0.05; // 5% de variation considéré comme stable

function detectTrend(recent: number[]): OddsTrend {
  if (recent.length < 2) return "stable";
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  if (!last || !prev) return "stable";
  const ratio = (last - prev) / prev;
  if (Math.abs(ratio) < STABLE_THRESHOLD) return "stable";
  return ratio < 0 ? "down" : "up";
}

/**
 * Construit l'historique des cotes par équipe (5 derniers matchs).
 * `history` doit être trié du plus récent au plus ancien (sortie standard de getPredictionHistory).
 */
export function buildOddsHistory(
  history: PredictionResult[],
  windowSize = 5,
): Record<string, TeamOddsHistory> {
  // Re-trier dans l'ordre chronologique (ancien → récent)
  const sorted = [...history].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const buckets: Record<string, number[]> = {};
  for (const h of sorted) {
    if (h.oddsHome > 0) {
      (buckets[h.homeTeam] ??= []).push(h.oddsHome);
    }
    if (h.oddsAway > 0) {
      (buckets[h.awayTeam] ??= []).push(h.oddsAway);
    }
  }

  const result: Record<string, TeamOddsHistory> = {};
  for (const [team, odds] of Object.entries(buckets)) {
    const recent = odds.slice(-windowSize);
    const last = recent[recent.length - 1] ?? 0;
    const prev = recent[recent.length - 2] ?? last;
    result[team] = { team, recent, last, prev, trend: detectTrend(recent) };
  }
  return result;
}

/**
 * Détecte les outsiders dangereux et favoris fragiles à partir de l'historique validé.
 */
export function detectMomentum(history: PredictionResult[]): MomentumAnalysis {
  const stats: Record<string, { winsAsOutsider: number; lossesAsFavorite: number }> = {};

  for (const h of history) {
    if (h.realScoreHome == null || h.realScoreAway == null) continue;
    const homeWon = h.realScoreHome > h.realScoreAway;
    const awayWon = h.realScoreAway > h.realScoreHome;

    const home = (stats[h.homeTeam] ??= { winsAsOutsider: 0, lossesAsFavorite: 0 });
    const away = (stats[h.awayTeam] ??= { winsAsOutsider: 0, lossesAsFavorite: 0 });

    if (h.oddsHome > 3.0 && homeWon) home.winsAsOutsider++;
    if (h.oddsAway > 3.0 && awayWon) away.winsAsOutsider++;
    if (h.oddsHome < 1.5 && !homeWon) home.lossesAsFavorite++;
    if (h.oddsAway < 1.5 && !awayWon) away.lossesAsFavorite++;
  }

  const dangerous: string[] = [];
  const fragile: string[] = [];
  for (const [team, s] of Object.entries(stats)) {
    if (s.winsAsOutsider >= 3) dangerous.push(team);
    if (s.lossesAsFavorite >= 2) fragile.push(team);
  }
  return { dangerous, fragile };
}

/** Symbole d'affichage pour une tendance. */
export function trendSymbol(t: OddsTrend): string {
  return t === "down" ? "↘" : t === "up" ? "↗" : "→";
}
