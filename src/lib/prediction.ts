import { getModelWeights, getTeamMemory, type ModelWeights } from "./cloudLearning";

export const TEAMS = [
  "A. Villa", "Bournemouth", "Brentford", "Brighton", "Burnley",
  "C. Palace", "Everton", "Fulham", "Leeds", "Liverpool",
  "London Blues", "London Reds", "Manchester Blue", "Manchester Red",
  "N. Forest", "Newcastle", "Spurs", "Sunderland", "West Ham", "Wolverhampton",
].sort();

const SCORE_PRIORS: Record<string, number> = {
  "1-0": 0.41, "0-1": 1.65, "2-0": 0.96, "0-2": 0.53, "2-1": 2.0,
  "1-2": 1.5, "3-0": 0.86, "0-3": 0.32, "3-1": 1.15, "1-3": 1.2,
  "3-2": 1.54, "2-3": 1.35, "4-1": 0.55, "1-4": 2.81, "4-0": 0.6,
  "0-4": 0.6, "1-1": 1.42, "2-2": 1.75, "3-3": 0.8, "0-0": 0.37,
};

export interface PredictionResult {
  id?: string;
  homeTeam: string;
  awayTeam: string;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  winner: string;
  winnerLabel: string;
  winProb: number;
  scoreHome: number;
  scoreAway: number;
  htHome: number;
  htAway: number;
  htft: string;
  overUnder: string;
  doubleChance: string;
  totalGoals: number;
  lambdaHome: number;
  lambdaAway: number;
  confidence: number;
  confidenceStars: number;
  valueBet: boolean;
  valueBetMarket: string;
  valueBetType: "DOM" | "EXT" | "NUL" | null;
  hotMatch: boolean;
  risky: boolean;
  pDOM: number;
  pNUL: number;
  pEXT: number;
  confidenceTier: "SAFE" | "MEDIUM" | "AGGRESSIVE";
  topScores: { score: string; prob: number }[];
  entropy: number;
  scoreConfidence: number;
  timestamp: number;
  realScoreHome?: number;
  realScoreAway?: number;
  validated?: boolean;
  roundNumber?: number;
  matchTime?: string;
}

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function getTeamAdjustment(
  team: string,
  isFavorite: boolean,
  memory: Awaited<ReturnType<typeof getTeamMemory>>,
): { trapFactor: number; overperformFactor: number } {
  const m = memory.find((t) => t.team_name === team);
  if (!m || m.total_matches < 3) return { trapFactor: 1, overperformFactor: 1 };
  const trapRate = m.trap_count / Math.max(1, m.total_matches);
  const overRate = m.overperform_count / Math.max(1, m.total_matches);
  let trapFactor = 1;
  if (isFavorite && trapRate > 0.2) {
    const penalty = Math.min((trapRate - 0.2) / 0.15, 1) * 0.22;
    trapFactor = 1 - penalty;
  }
  let overperformFactor = 1;
  if (overRate > 0.15) overperformFactor = 1 + Math.min(overRate * 0.3, 0.18);
  return { trapFactor, overperformFactor };
}

export async function predict(
  homeTeam: string,
  awayTeam: string,
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number,
): Promise<PredictionResult> {
  const weights: ModelWeights = await getModelWeights();
  const memory = await getTeamMemory();

  const invH = 1 / oddsHome;
  const invD = 1 / oddsDraw;
  const invA = 1 / oddsAway;
  const total = invH + invD + invA;
  let pDOM = invH / total;
  let pNUL = invD / total;
  let pEXT = invA / total;

  pDOM *= weights.homeAdvantage;
  pNUL *= weights.drawBias;
  pEXT *= weights.extBoost;

  const homeAdj = getTeamAdjustment(homeTeam, oddsHome < 1.8, memory);
  const awayAdj = getTeamAdjustment(awayTeam, oddsAway < 1.8, memory);
  pDOM *= homeAdj.trapFactor * homeAdj.overperformFactor;
  pEXT *= awayAdj.trapFactor * awayAdj.overperformFactor;

  if (oddsHome >= 1.6 && oddsHome <= 1.8) {
    const reduction = (weights.antiTrapStrength - 1) * 0.1;
    pDOM *= 1 - reduction;
    pNUL *= 1 + reduction * 0.5;
    pEXT *= 1 + reduction * 0.5;
  }
  if (oddsAway >= 1.6 && oddsAway <= 1.8) {
    const reduction = (weights.antiTrapStrength - 1) * 0.1;
    pEXT *= 1 - reduction;
    pNUL *= 1 + reduction * 0.5;
    pDOM *= 1 + reduction * 0.5;
  }

  const sum = pDOM + pNUL + pEXT;
  pDOM /= sum;
  pNUL /= sum;
  pEXT /= sum;
  if (pNUL > 0.3) {
    const excess = pNUL - 0.3;
    pNUL = 0.3;
    pDOM += excess * (pDOM / (pDOM + pEXT));
    pEXT += excess * (pEXT / (pDOM + pEXT));
  }

  let lH = (1.45 + (1.9 - oddsHome) * 0.35) * weights.lambdaBoost;
  let lA = (1.15 + (1.9 - oddsAway) * 0.35) * weights.lambdaBoost;
  lH = Math.max(0.4, Math.min(3.5, lH));
  lA = Math.max(0.3, Math.min(3.2, lA));

  const oddsDiff = Math.abs(oddsHome - oddsAway);
  const avgOdds = (oddsHome + oddsAway) / 2;
  let goalAdjustment = 1.0;
  if (oddsDiff < 0.6 && avgOdds > 2.0 && avgOdds < 3.0) goalAdjustment = 1.25;
  else if (oddsHome < 1.4 && oddsAway > 3.0) goalAdjustment = 1.15;
  else if (oddsHome > 2.8 && oddsAway < 2.3) goalAdjustment = 1.1;
  lH *= goalAdjustment;
  lA *= goalAdjustment;

  let winnerLabel: string;
  let winProb: number;
  if (pDOM >= pEXT && pDOM >= pNUL) {
    winnerLabel = "1";
    winProb = pDOM;
  } else if (pEXT >= pNUL) {
    winnerLabel = "2";
    winProb = pEXT;
  } else {
    winnerLabel = "X";
    winProb = pNUL;
  }

  const impliedH = 1 / oddsHome,
    impliedD = 1 / oddsDraw,
    impliedA = 1 / oddsAway;
  let valueBetType: "DOM" | "EXT" | "NUL" | null = null;
  let valueBetMarket = "";
  if (pDOM > impliedH * 1.12) {
    valueBetType = "DOM";
    valueBetMarket = "1";
  } else if (pEXT > impliedA * 1.12) {
    valueBetType = "EXT";
    valueBetMarket = "2";
  } else if (pNUL > impliedD * 1.18) {
    valueBetType = "NUL";
    valueBetMarket = "X";
  }

  const winner =
    winnerLabel === "1" ? homeTeam : winnerLabel === "2" ? awayTeam : "Match Nul";

  const candidates: { i: number; j: number; prob: number }[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const key = `${i}-${j}`;
      const prior = SCORE_PRIORS[key] ?? 0.15;
      let prob = poisson(i, lH) * poisson(j, lA) * prior;
      if (i + j >= 6) prob *= 0.5;
      if (i >= 5 || j >= 5) prob *= 0.4;
      candidates.push({ i, j, prob });
    }
  }

  const compatible = candidates.filter(({ i, j }) => {
    if (winnerLabel === "1") return i > j;
    if (winnerLabel === "2") return j > i;
    return i === j;
  });

  const compTotal = compatible.reduce((s, c) => s + c.prob, 0) || 1;
  compatible.forEach((c) => (c.prob /= compTotal));
  compatible.sort((a, b) => b.prob - a.prob);
  const topScores = compatible
    .slice(0, 3)
    .map((c) => ({ score: `${c.i}-${c.j}`, prob: c.prob }));

  const scoreHome = compatible[0]?.i ?? 1;
  const scoreAway = compatible[0]?.j ?? 0;
  const htHome = Math.round(scoreHome * 0.42);
  const htAway = Math.round(scoreAway * 0.42);
  const htWinner = htHome > htAway ? "1" : htAway > htHome ? "2" : "X";
  const htft = `${htWinner}/${winnerLabel}`;
  const totalGoals = scoreHome + scoreAway;
  const expectedTotal = lH + lA;
  const overUnder = expectedTotal > 2.6 ? "Over 2.5" : "Under 2.5";
  const doubleChance =
    winnerLabel === "1" ? "1X" : winnerLabel === "2" ? "X2" : "1X";

  const confidence = winProb * 100;
  const confidenceStars =
    confidence >= 70 ? 5 : confidence >= 60 ? 4 : confidence >= 50 ? 3 : confidence >= 40 ? 2 : 1;
  const confidenceTier: "SAFE" | "MEDIUM" | "AGGRESSIVE" =
    confidence >= 60 ? "SAFE" : confidence >= 50 ? "MEDIUM" : "AGGRESSIVE";

  const hotMatch = expectedTotal > 3.0 && Math.abs(pDOM - pEXT) < 0.15;
  const risky = confidence < 45 || pNUL > 0.28;

  const entropy = -topScores.reduce(
    (s, c) => s + (c.prob > 0 ? c.prob * Math.log2(c.prob) : 0),
    0,
  );
  const scoreConfidence = topScores[0]?.prob ?? 0;

  return {
    homeTeam,
    awayTeam,
    oddsHome,
    oddsDraw,
    oddsAway,
    winner,
    winnerLabel,
    winProb,
    scoreHome,
    scoreAway,
    htHome,
    htAway,
    htft,
    overUnder,
    doubleChance,
    totalGoals,
    lambdaHome: lH,
    lambdaAway: lA,
    confidence,
    confidenceStars,
    valueBet: valueBetType !== null,
    valueBetMarket,
    valueBetType,
    hotMatch,
    risky,
    pDOM,
    pNUL,
    pEXT,
    confidenceTier,
    topScores,
    entropy,
    scoreConfidence,
    timestamp: Date.now(),
  };
}
