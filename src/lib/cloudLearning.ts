import { supabase } from "@/integrations/supabase/client";
import type { PredictionResult } from "./prediction";
import { getOrTrainModel, resetModel } from "./supervisedModel";

export interface ModelWeights {
  oddsWeight: number;
  formWeight: number;
  historyWeight: number;
  drawBias: number;
  homeAdvantage: number;
  antiTrapStrength: number;
  lambdaBoost: number;
  extBoost: number;
}

export interface TeamMemoryRow {
  team_name: string;
  trap_count: number;
  overperform_count: number;
  underperform_count: number;
  total_matches: number;
  avg_goals_diff: number;
}

const DEFAULT_WEIGHTS: ModelWeights = {
  oddsWeight: 0.5,
  formWeight: 0.22,
  historyWeight: 0.28,
  drawBias: 1.15,
  homeAdvantage: 0.95,
  antiTrapStrength: 1.3,
  lambdaBoost: 1.0,
  extBoost: 1.08,
};

const BOUNDS: Record<keyof ModelWeights, [number, number]> = {
  oddsWeight: [0.3, 0.8],
  formWeight: [0.05, 0.45],
  historyWeight: [0.05, 0.45],
  drawBias: [0.7, 1.4],
  homeAdvantage: [0.8, 1.25],
  antiTrapStrength: [0.7, 1.7],
  lambdaBoost: [0.6, 1.7],
  extBoost: [0.9, 1.3],
};

function clamp(v: number, [lo, hi]: [number, number]) {
  return Math.max(lo, Math.min(hi, v));
}

let weightsCache: ModelWeights | null = null;
let memoryCache: TeamMemoryRow[] | null = null;
let userIdCache: string | null = null;
let userIdPromise: Promise<string | null> | null = null;

async function getUserId(): Promise<string | null> {
  if (userIdCache) return userIdCache;
  if (userIdPromise) return userIdPromise;

  userIdPromise = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      userIdCache = session.user.id;
      return userIdCache;
    }
    return null;
  })();

  const result = await userIdPromise;
  userIdPromise = null;
  return result;
}

// Reset cached user id (used on logout)
export function resetUserCache() {
  userIdCache = null;
  userIdPromise = null;
  weightsCache = null;
  memoryCache = null;
}

// Invalidate weights/memory caches without dropping user identity
export function invalidateCache() {
  weightsCache = null;
  memoryCache = null;
  resetModel();
}

export async function getModelWeights(): Promise<ModelWeights> {
  if (weightsCache) return weightsCache;
  const userId = await getUserId();
  if (!userId) return { ...DEFAULT_WEIGHTS };

  const { data } = await supabase
    .from("model_weights")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabase.from("model_weights").insert({ user_id: userId });
    weightsCache = { ...DEFAULT_WEIGHTS };
    return weightsCache;
  }

  weightsCache = {
    oddsWeight: data.odds_weight,
    formWeight: data.form_weight,
    historyWeight: data.history_weight,
    drawBias: data.draw_bias,
    homeAdvantage: data.home_advantage,
    antiTrapStrength: data.anti_trap_strength,
    lambdaBoost: data.lambda_boost,
    extBoost: data.ext_boost,
  };
  return weightsCache;
}

export async function saveModelWeights(w: ModelWeights): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const bounded: ModelWeights = {
    oddsWeight: clamp(w.oddsWeight, BOUNDS.oddsWeight),
    formWeight: clamp(w.formWeight, BOUNDS.formWeight),
    historyWeight: clamp(w.historyWeight, BOUNDS.historyWeight),
    drawBias: clamp(w.drawBias, BOUNDS.drawBias),
    homeAdvantage: clamp(w.homeAdvantage, BOUNDS.homeAdvantage),
    antiTrapStrength: clamp(w.antiTrapStrength, BOUNDS.antiTrapStrength),
    lambdaBoost: clamp(w.lambdaBoost, BOUNDS.lambdaBoost),
    extBoost: clamp(w.extBoost, BOUNDS.extBoost),
  };
  await supabase.from("model_weights").upsert(
    {
      user_id: userId,
      odds_weight: bounded.oddsWeight,
      form_weight: bounded.formWeight,
      history_weight: bounded.historyWeight,
      draw_bias: bounded.drawBias,
      home_advantage: bounded.homeAdvantage,
      anti_trap_strength: bounded.antiTrapStrength,
      lambda_boost: bounded.lambdaBoost,
      ext_boost: bounded.extBoost,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  weightsCache = bounded;
}

export async function getTeamMemory(): Promise<TeamMemoryRow[]> {
  if (memoryCache) return memoryCache;
  const userId = await getUserId();
  if (!userId) return [];
  const { data } = await supabase.from("team_memory").select("*").eq("user_id", userId);
  memoryCache = (data ?? []).map((d) => ({
    team_name: d.team_name,
    trap_count: d.trap_count,
    overperform_count: d.overperform_count,
    underperform_count: d.underperform_count,
    total_matches: d.total_matches,
    avg_goals_diff: d.avg_goals_diff,
  }));
  return memoryCache;
}

async function upsertTeamMemory(
  userId: string,
  teamName: string,
  patch: Partial<Omit<TeamMemoryRow, "team_name">>,
) {
  const { data: existing } = await supabase
    .from("team_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("team_name", teamName)
    .maybeSingle();

  const row = existing ?? {
    user_id: userId,
    team_name: teamName,
    trap_count: 0,
    overperform_count: 0,
    underperform_count: 0,
    total_matches: 0,
    avg_goals_diff: 0,
  };

  const newTotal = row.total_matches + (patch.total_matches ?? 0);
  const merged = {
    user_id: userId,
    team_name: teamName,
    trap_count: row.trap_count + (patch.trap_count ?? 0),
    overperform_count: row.overperform_count + (patch.overperform_count ?? 0),
    underperform_count: row.underperform_count + (patch.underperform_count ?? 0),
    total_matches: newTotal,
    avg_goals_diff:
      patch.avg_goals_diff !== undefined
        ? (row.avg_goals_diff * row.total_matches + patch.avg_goals_diff) / Math.max(1, newTotal)
        : row.avg_goals_diff,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("team_memory").upsert(merged, { onConflict: "user_id,team_name" });
}

export async function updateModelWeights(
  item: PredictionResult,
  realScore: { home: number; away: number },
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  if (item.id) {
    await supabase
      .from("prediction_history")
      .update({
        is_validated: true,
        real_score_home: realScore.home,
        real_score_away: realScore.away,
      })
      .eq("id", item.id);
  }

  const realWinner =
    realScore.home > realScore.away ? "1" : realScore.away > realScore.home ? "2" : "X";
  const winnerCorrect = realWinner === item.winnerLabel;
  const scoreCorrect = realScore.home === item.scoreHome && realScore.away === item.scoreAway;

  const weights = await getModelWeights();
  const next = { ...weights };
  const validatedCount = (await getLearningStats()).validated;
  const baseLR = 0.01;
  const lr = validatedCount < 100 ? baseLR * 1.5 : validatedCount < 300 ? baseLR : baseLR * 0.7;

  if (winnerCorrect) {
    next.oddsWeight += lr * 0.3;
  } else {
    next.oddsWeight -= lr * 0.5;
    if (item.winnerLabel === "X") next.drawBias -= lr * 1.5;
    if (item.winnerLabel === "1" && item.oddsHome < 1.8) {
      next.homeAdvantage -= lr;
      next.antiTrapStrength += lr * 2;
    }
  }
  if (!winnerCorrect && realWinner === "X") {
    next.drawBias += lr * 4;
    next.homeAdvantage = Math.max(BOUNDS.homeAdvantage[0], next.homeAdvantage - lr * 0.5);
  }
  if (!winnerCorrect && realWinner === "X" && item.winnerLabel !== "X") {
    next.oddsWeight = Math.max(BOUNDS.oddsWeight[0], next.oddsWeight - lr * 0.3);
  }
  if (winnerCorrect && item.confidence > 75) {
    next.oddsWeight += lr * 0.5;
    next.homeAdvantage += lr * 0.2;
  }
  if (scoreCorrect) next.lambdaBoost += lr * 0.5;

  await saveModelWeights(next);

  const homeFav = item.oddsHome < 2.0;
  const awayFav = item.oddsAway < 2.0;
  const homeOutsider = item.oddsHome > 4.0;
  const awayOutsider = item.oddsAway > 4.0;

  const homePatch: Partial<TeamMemoryRow> = {
    total_matches: 1,
    avg_goals_diff: item.scoreHome - realScore.home,
  };
  const awayPatch: Partial<TeamMemoryRow> = {
    total_matches: 1,
    avg_goals_diff: item.scoreAway - realScore.away,
  };

  if (homeFav && realWinner !== "1") homePatch.trap_count = 1;
  if (awayFav && realWinner !== "2") awayPatch.trap_count = 1;
  if (homeOutsider && realWinner === "1") homePatch.overperform_count = 1;
  if (awayOutsider && realWinner === "2") awayPatch.overperform_count = 1;
  if (homeFav && realWinner === "2") homePatch.underperform_count = 1;
  if (awayFav && realWinner === "1") awayPatch.underperform_count = 1;

  await Promise.all([
    upsertTeamMemory(userId, item.homeTeam, homePatch),
    upsertTeamMemory(userId, item.awayTeam, awayPatch),
  ]);

  memoryCache = null;
  weightsCache = null;
  resetModel();

  if (typeof window !== "undefined") {
    if ((window as any).__retrainTimeout) {
      clearTimeout((window as any).__retrainTimeout);
    }
    (window as any).__retrainTimeout = setTimeout(async () => {
      try {
        await getOrTrainModel(true);
      } catch (e) {
        console.warn("Supervised model retrain skipped:", e);
      }
    }, 2000);
  } else {
    try {
      await getOrTrainModel(true);
    } catch (e) {
      console.warn("Supervised model retrain skipped:", e);
    }
  }
}

export async function resetWeights(): Promise<void> {
  await saveModelWeights({ ...DEFAULT_WEIGHTS });
  weightsCache = { ...DEFAULT_WEIGHTS };
  resetModel();
}

export type TeamReliability = "high" | "medium" | "low";

export async function getTeamReliability(): Promise<Record<string, TeamReliability>> {
  const memory = await getTeamMemory();
  const result: Record<string, TeamReliability> = {};
  for (const t of memory) {
    if (t.total_matches < 5) continue;
    const trapRate = t.trap_count / Math.max(1, t.total_matches);
    result[t.team_name] = trapRate > 0.35 ? "low" : trapRate > 0.2 ? "medium" : "high";
  }
  return result;
}

export interface LearningStats {
  totalMatches: number;
  validated: number;
  accuracy: number;
  recentAccuracy: number;
  scoreAccuracy: number;
  weights: ModelWeights;
  trapTeams: TeamMemoryRow[];
  overperformTeams: TeamMemoryRow[];
  avoidTeams: TeamMemoryRow[];
  nulPredicted: number;
  nulReal: number;
  nulCorrect: number;
  missedDraws: number;
  extPredicted: number;
  domAccuracy: number;
  extAccuracy: number;
  nulAccuracy: number;
}

export async function getLearningStats(): Promise<LearningStats> {
  const userId = await getUserId();
  if (!userId) {
    return {
      totalMatches: 0,
      validated: 0,
      accuracy: 0,
      recentAccuracy: 0,
      scoreAccuracy: 0,
      weights: DEFAULT_WEIGHTS,
      trapTeams: [],
      overperformTeams: [],
      avoidTeams: [],
      nulPredicted: 0,
      nulReal: 0,
      nulCorrect: 0,
      missedDraws: 0,
      extPredicted: 0,
      domAccuracy: 0,
      extAccuracy: 0,
      nulAccuracy: 0,
    };
  }

  const { count: totalValidated } = await supabase
    .from("prediction_history")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_validated", true);

  const validated: any[] = [];
  const pageSize = 1000;
  const total = totalValidated ?? 0;
  for (let from = 0; from < total; from += pageSize) {
    const { data: page } = await supabase
      .from("prediction_history")
      .select("*")
      .eq("user_id", userId)
      .eq("is_validated", true)
      .order("created_at", { ascending: false })
      .range(from, Math.min(from + pageSize - 1, total - 1));
    if (page) validated.push(...page);
  }
  const correct = validated.filter((h) => {
    const rw =
      (h.real_score_home ?? 0) > (h.real_score_away ?? 0)
        ? "1"
        : (h.real_score_away ?? 0) > (h.real_score_home ?? 0)
          ? "2"
          : "X";
    return rw === h.winner_label;
  });

  const scoreCorrect = validated.filter(
    (h) => h.real_score_home === h.score_home && h.real_score_away === h.score_away,
  );

  const recent = validated.slice(0, 10);
  const recentCorrect = recent.filter((h) => {
    const rw =
      (h.real_score_home ?? 0) > (h.real_score_away ?? 0)
        ? "1"
        : (h.real_score_away ?? 0) > (h.real_score_home ?? 0)
          ? "2"
          : "X";
    return rw === h.winner_label;
  });

  const memory = await getTeamMemory();
  const trapTeams = memory
    .filter((m) => m.total_matches >= 2 && m.trap_count >= 2)
    .sort((a, b) => b.trap_count - a.trap_count)
    .slice(0, 5);
  const overperformTeams = memory
    .filter((m) => m.overperform_count >= 1)
    .sort((a, b) => b.overperform_count - a.overperform_count)
    .slice(0, 5);
  const avoidTeams = memory
    .filter((m) => m.total_matches >= 5 && m.trap_count / m.total_matches > 0.2)
    .sort((a, b) => b.trap_count / b.total_matches - a.trap_count / a.total_matches)
    .slice(0, 5);

  const domPredicted = validated.filter((h) => h.winner_label === "1");
  const extPredicted = validated.filter((h) => h.winner_label === "2");
  const nulPredictedArr = validated.filter((h) => h.winner_label === "X");
  const nulReal = validated.filter(
    (h) => (h.real_score_home ?? 0) === (h.real_score_away ?? 0),
  ).length;
  const nulCorrect = nulPredictedArr.filter(
    (h) => (h.real_score_home ?? 0) === (h.real_score_away ?? 0),
  ).length;
  const domAccuracy = domPredicted.length
    ? domPredicted.filter((h) => (h.real_score_home ?? 0) > (h.real_score_away ?? 0)).length /
      domPredicted.length
    : 0;
  const extAccuracy = extPredicted.length
    ? extPredicted.filter((h) => (h.real_score_away ?? 0) > (h.real_score_home ?? 0)).length /
      extPredicted.length
    : 0;
  const nulAccuracy = nulPredictedArr.length ? nulCorrect / nulPredictedArr.length : 0;

  return {
    totalMatches: validated.length,
    validated: validated.length,
    accuracy: validated.length ? correct.length / validated.length : 0,
    recentAccuracy: recent.length ? recentCorrect.length / recent.length : 0,
    scoreAccuracy: validated.length ? scoreCorrect.length / validated.length : 0,
    weights: await getModelWeights(),
    trapTeams,
    overperformTeams,
    avoidTeams,
    nulPredicted: nulPredictedArr.length,
    nulReal,
    nulCorrect,
    missedDraws: nulReal - nulCorrect,
    extPredicted: extPredicted.length,
    domAccuracy,
    extAccuracy,
    nulAccuracy,
  };
}

export async function savePrediction(
  p: PredictionResult,
  roundNumber?: number,
  matchTime?: string,
  eventCategoryId?: string,
): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("prediction_history")
    .insert({
      user_id: userId,
      home_team: p.homeTeam,
      away_team: p.awayTeam,
      odds_home: p.oddsHome,
      odds_draw: p.oddsDraw,
      odds_away: p.oddsAway,
      winner: p.winner,
      winner_label: p.winnerLabel,
      score_home: p.scoreHome,
      score_away: p.scoreAway,
      confidence: p.confidence,
      win_prob: p.winProb,
      value_bet: p.valueBetMarket || null,
      value_bet_odds:
        p.valueBetType === "DOM"
          ? p.oddsHome
          : p.valueBetType === "EXT"
            ? p.oddsAway
            : p.valueBetType === "NUL"
              ? p.oddsDraw
              : null,
      value_bet_proba:
        p.valueBetType === "DOM"
          ? p.pDOM
          : p.valueBetType === "EXT"
            ? p.pEXT
            : p.valueBetType === "NUL"
              ? p.pNUL
              : null,
      round_number: roundNumber ?? null,
      match_time: matchTime ?? null,
      event_category_id: eventCategoryId ?? null,
      prediction_data: {
        htHome: p.htHome,
        htAway: p.htAway,
        htft: p.htft,
        overUnder: p.overUnder,
        overUnder35: p.overUnder35,
        doubleChance: p.doubleChance,
        totalGoals: p.totalGoals,
        lambdaHome: p.lambdaHome,
        lambdaAway: p.lambdaAway,
        confidenceStars: p.confidenceStars,
        valueBetType: p.valueBetType,
        hotMatch: p.hotMatch,
        risky: p.risky,
        pDOM: p.pDOM,
        pNUL: p.pNUL,
        pEXT: p.pEXT,
        topScores: p.topScores,
        entropy: p.entropy,
        scoreConfidence: p.scoreConfidence,
        confidenceTier: p.confidenceTier,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("savePrediction error:", error);
    return null;
  }
  return data.id;
}

export async function getPredictionHistory(eventCategoryId?: string): Promise<PredictionResult[]> {
  const userId = await getUserId();
  if (!userId) return [];

  let query = supabase
    .from("prediction_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (eventCategoryId) {
    query = query.eq("event_category_id", eventCategoryId);
  }

  const { data } = await query;

  return (data ?? []).map((h) => {
    const pd = (h.prediction_data ?? {}) as Record<string, unknown>;
    return {
      id: h.id,
      homeTeam: h.home_team,
      awayTeam: h.away_team,
      oddsHome: h.odds_home,
      oddsDraw: h.odds_draw,
      oddsAway: h.odds_away,
      winner: h.winner,
      winnerLabel: h.winner_label,
      winProb: h.win_prob,
      scoreHome: h.score_home,
      scoreAway: h.score_away,
      htHome: (pd.htHome as number) ?? 0,
      htAway: (pd.htAway as number) ?? 0,
      htft: (pd.htft as string) ?? "",
      overUnder: (pd.overUnder as string) ?? "",
      overUnder35:
        (pd.overUnder35 as string) ??
        (((pd.lambdaHome as number) ?? 0) + ((pd.lambdaAway as number) ?? 0) > 3.5
          ? "Over 3.5"
          : "Under 3.5"),
      doubleChance: (pd.doubleChance as string) ?? "",
      totalGoals: (pd.totalGoals as number) ?? 0,
      lambdaHome: (pd.lambdaHome as number) ?? 0,
      lambdaAway: (pd.lambdaAway as number) ?? 0,
      confidence: h.confidence,
      confidenceStars: (pd.confidenceStars as number) ?? 0,
      valueBet: !!h.value_bet,
      valueBetMarket: h.value_bet ?? "",
      valueBetType: (pd.valueBetType as "DOM" | "EXT" | "NUL" | null) ?? null,
      hotMatch: (pd.hotMatch as boolean) ?? false,
      risky: (pd.risky as boolean) ?? false,
      pDOM: (pd.pDOM as number) ?? 0,
      pNUL: (pd.pNUL as number) ?? 0,
      pEXT: (pd.pEXT as number) ?? 0,
      confidenceTier: (pd.confidenceTier as "SAFE" | "MEDIUM" | "AGGRESSIVE") ?? "MEDIUM",
      topScores: (pd.topScores as { score: string; prob: number }[]) ?? [],
      entropy: (pd.entropy as number) ?? 0,
      scoreConfidence: (pd.scoreConfidence as number) ?? 0,
      timestamp: new Date(h.created_at).getTime(),
      validated: h.is_validated,
      realScoreHome: h.real_score_home ?? undefined,
      realScoreAway: h.real_score_away ?? undefined,
      roundNumber: h.round_number ?? undefined,
      matchTime: h.match_time ?? undefined,
    };
  });
}

export async function getDistinctCategories(): Promise<string[]> {
  const userId = await getUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from("prediction_history")
    .select("event_category_id")
    .eq("user_id", userId)
    .not("event_category_id", "is", null)
    .order("created_at", { ascending: false });
  const cats = [...new Set((data ?? []).map((d) => d.event_category_id))];
  return cats.filter(Boolean) as string[];
}

/**
 * Returns ALL validated real scores across all categories, keyed by
 * `${roundNumber}|${homeTeam}|${awayTeam}`. Used to seed the local score cache
 * so partial rounds get filled even after the Sporty-Tech API purges scores.
 */
export async function getValidatedScoresMap(): Promise<
  Record<string, { home: number; away: number }>
> {
  const userId = await getUserId();
  if (!userId) return {};
  const { data } = await supabase
    .from("prediction_history")
    .select("round_number, home_team, away_team, real_score_home, real_score_away")
    .eq("user_id", userId)
    .eq("is_validated", true)
    .not("round_number", "is", null);
  const out: Record<string, { home: number; away: number }> = {};
  for (const r of data ?? []) {
    if (r.round_number == null || r.real_score_home == null || r.real_score_away == null) continue;
    out[`${r.round_number}|${r.home_team}|${r.away_team}`] = {
      home: r.real_score_home,
      away: r.real_score_away,
    };
  }
  return out;
}

export async function getCurrentRegime(): Promise<{ name: string; avgGoals: number }> {
  const userId = await getUserId();
  if (!userId) return { name: "BALANCED", avgGoals: 2.4 };
  const { data } = await supabase
    .from("prediction_history")
    .select("real_score_home, real_score_away")
    .eq("user_id", userId)
    .eq("is_validated", true)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!data || data.length === 0) return { name: "BALANCED", avgGoals: 2.4 };
  const totalGoals = data.reduce(
    (sum, row) => sum + (row.real_score_home ?? 0) + (row.real_score_away ?? 0),
    0,
  );
  const avg = totalGoals / data.length;
  if (avg <= 2.0) return { name: "DEFENSIVE", avgGoals: avg };
  if (avg >= 2.6) return { name: "OFFENSIVE", avgGoals: avg };
  return { name: "BALANCED", avgGoals: avg };
}
