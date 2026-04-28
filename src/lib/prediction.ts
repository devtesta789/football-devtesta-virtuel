import {
  getModelWeights,
  getTeamMemory,
  getCurrentRegime,
  type ModelWeights,
} from "./cloudLearning";
import { getCurrentModel, getOrTrainModel } from "./supervisedModel";

export const TEAMS = [
  "A. Villa",
  "Bournemouth",
  "Brentford",
  "Brighton",
  "Burnley",
  "C. Palace",
  "Everton",
  "Fulham",
  "Leeds",
  "Liverpool",
  "London Blues",
  "London Reds",
  "Manchester Blue",
  "Manchester Red",
  "N. Forest",
  "Newcastle",
  "Spurs",
  "Sunderland",
  "West Ham",
  "Wolverhampton",
].sort();

const SCORE_PRIORS: Record<string, number> = {
  // Draws — rééquilibrés
  "1-1": 3.2,
  "0-0": 1.4,
  "2-2": 2.2,
  "3-3": 0.15,
  // Home wins — réduits pour éviter sur-prédiction
  "1-0": 1.5,
  "2-0": 1.4,
  "2-1": 2.5,
  "3-0": 0.95,
  "3-1": 1.5,
  "3-2": 1.2,
  "4-0": 0.6,
  "4-1": 0.55,
  "5-0": 0.3,
  "4-2": 0.2,
  "5-1": 0.15,
  "6-0": 0.1,
  // Away wins — symétriques
  "0-1": 2.4,
  "0-2": 1.3,
  "1-2": 2.2,
  "0-3": 0.5,
  "1-3": 1.0,
  "2-3": 0.7,
  "0-4": 0.3,
  "1-4": 0.4,
  "0-5": 0.12,
  "1-5": 0.08,
  "0-6": 0.08,
  "2-4": 0.1,
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
  overUnder35: string;
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
  isSafeZone?: boolean;
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
  if (!m || m.total_matches < 5) return { trapFactor: 1, overperformFactor: 1 };

  const trapRate = m.trap_count / Math.max(1, m.total_matches);
  const overRate = m.overperform_count / Math.max(1, m.total_matches);
  const underRate = m.underperform_count / Math.max(1, m.total_matches);

  // Anti-trap ALLÉGÉ : ne pénalise qu'au-dessus de 25% trap rate, max 12%
  // (avant: 15% / 35% — trop agressif, détruisait les vrais favoris)
  let trapFactor = 1;
  if (isFavorite && trapRate > 0.25) {
    const penalty = Math.min((trapRate - 0.25) / 0.15, 1) * 0.12;
    trapFactor = 1 - penalty;
  }
  if (isFavorite && underRate > 0.15) {
    trapFactor *= 1 - Math.min(underRate * 0.25, 0.1);
  }

  let overperformFactor = 1;
  if (overRate > 0.15) overperformFactor = 1 + Math.min(overRate * 0.3, 0.18);

  return { trapFactor: Math.max(0.82, trapFactor), overperformFactor };
}

const DYNAMIC_BONUS_00_MAP: [number, number][] = [
  [2.0, 1.85],
  [2.5, 1.17],
  [3.0, 0.85],
  [3.5, 0.6],
  [5.0, 0.48],
  [10.0, 0.32],
  [999, 0.2],
];

function getBonus00(drawOdds: number): number {
  for (const [mx, bonus] of DYNAMIC_BONUS_00_MAP) {
    if (drawOdds < mx) return bonus;
  }
  return 0.2;
}

const DYNAMIC_BONUS_10_MAP: [number, number, number, number, number, number][] = [
  [1.0, 1.15, 0.55, 0.12, 1.4, 2.2],
  [1.15, 1.35, 1.0, 0.3, 1.3, 1.6],
  [1.35, 1.6, 1.4, 0.6, 1.05, 1.0],
  [1.6, 2.0, 1.25, 0.85, 0.9, 0.75],
  [2.0, 3.0, 1.05, 1.1, 0.8, 0.45],
  [3.0, 999, 0.7, 1.3, 0.5, 0.12],
];

function getScoreBonuses(homeOdds: number): { b10: number; b01: number; b20: number; b30: number } {
  for (const [lo, hi, b10, b01, b20, b30] of DYNAMIC_BONUS_10_MAP) {
    if (homeOdds >= lo && homeOdds < hi) {
      return { b10, b01, b20, b30 };
    }
  }
  return { b10: 1, b01: 1, b20: 1, b30: 1 };
}

export async function predict(
  homeTeam: string,
  awayTeam: string,
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number,
  winPenaltyFactor = 1,
  nulBonusFactor = 1,
): Promise<PredictionResult> {
  const weights: ModelWeights = await getModelWeights();
  const memory = await getTeamMemory();
  const regime = await getCurrentRegime();

  let winnerLabel: string;
  let pDOM: number;
  let pNUL: number;
  let pEXT: number;
  let winProb = 0;
  let modelUsed = false;

  const currentModel = getCurrentModel();
  if (!currentModel) {
    try {
      await getOrTrainModel();
    } catch {
      // fallback to heuristics when not enough supervised data
    }
  }

  const trainedModel = getCurrentModel();
  if (trainedModel && trainedModel.isTrained()) {
    modelUsed = true;
    const pred = trainedModel.predict([oddsHome, oddsDraw, oddsAway]);
    winnerLabel = pred.label;
    pDOM = pred.probs["1"] ?? 0.33;
    pNUL = pred.probs["X"] ?? 0.33;
    pEXT = pred.probs["2"] ?? 0.33;
    winProb = pred.probs[winnerLabel] ?? 0.33;
  } else {
    const invH = 1 / oddsHome;
    const invD = 1 / oddsDraw;
    const invA = 1 / oddsAway;
    const total = invH + invD + invA;
    pDOM = invH / total;
    pNUL = invD / total;
    pEXT = invA / total;

    pDOM *= weights.homeAdvantage;
    pNUL *= weights.drawBias;
    pEXT *= weights.extBoost;

    const homeAdj = getTeamAdjustment(homeTeam, oddsHome < 1.8, memory);
    const awayAdj = getTeamAdjustment(awayTeam, oddsAway < 1.8, memory);
    pDOM *= homeAdj.trapFactor * homeAdj.overperformFactor;
    pEXT *= awayAdj.trapFactor * awayAdj.overperformFactor;

    // === MODÈLE SIMPLIFIÉ — basé sur stats réelles 766 matchs ===
    // Précision favori marché brut: 54%, DOM favori: 65.7%, NUL>3.5: 22%
    // Stratégie: faire confiance aux odds, anti-trap MINIMAL, NUL très restrictif

    // Léger anti-trap zone DOM 1.7-2.4 (3% transfert max, pas 35%)
    if (oddsHome >= 1.7 && oddsHome <= 2.4 && weights.antiTrapStrength > 1) {
      const t = pDOM * 0.03 * Math.min(weights.antiTrapStrength - 1, 1);
      pDOM -= t;
      pNUL += t * 0.6;
      pEXT += t * 0.4;
    }

    // Re-normalize
    {
      const s = pDOM + pNUL + pEXT;
      pDOM /= s; pNUL /= s; pEXT /= s;
    }

    // Plafond NUL strict : jamais > 38% sauf si cote nul vraiment basse
    const nulCeiling = oddsDraw < 3.0 ? 0.45 : oddsDraw < 3.4 ? 0.38 : 0.32;
    if (pNUL > nulCeiling) {
      const excess = pNUL - nulCeiling;
      pNUL = nulCeiling;
      const denom = pDOM + pEXT || 1;
      pDOM += excess * (pDOM / denom);
      pEXT += excess * (pEXT / denom);
    }

    // Apply learning weights legers
    if (winPenaltyFactor < 1) {
      pDOM *= winPenaltyFactor;
      pEXT *= winPenaltyFactor;
    }
    pNUL *= nulBonusFactor;
    {
      const s = pDOM + pNUL + pEXT;
      pDOM /= s; pNUL /= s; pEXT /= s;
    }

    // === DÉCISION SIMPLE: argmax avec règle NUL restrictive ===
    // NUL n'est choisi QUE si:
    //   - oddsDraw <= 3.3 (sinon précision NUL = 22-25%)
    //   - ET pNUL est le max
    //   - ET match équilibré (|oddsHome - oddsAway| < 0.8)
    const drawAllowed =
      oddsDraw <= 3.3 && Math.abs(oddsHome - oddsAway) < 0.8;

    if (pDOM >= pEXT && pDOM >= pNUL) {
      winnerLabel = "1";
      winProb = pDOM;
    } else if (pEXT >= pDOM && pEXT >= pNUL) {
      winnerLabel = "2";
      winProb = pEXT;
    } else if (drawAllowed) {
      winnerLabel = "X";
      winProb = pNUL;
    } else {
      // NUL serait gagnant mais conditions pas remplies → favori marché
      if (pDOM >= pEXT) { winnerLabel = "1"; winProb = pDOM; }
      else { winnerLabel = "2"; winProb = pEXT; }
    }

    // GARDE-FOU UNIQUE: EXT avec cote très haute (>3.0) = 30% précision
    // → bascule vers favori du marché
    if (winnerLabel === "2" && oddsAway > 3.0) {
      if (oddsHome <= oddsDraw) { winnerLabel = "1"; winProb = pDOM; }
      else if (drawAllowed) { winnerLabel = "X"; winProb = pNUL; }
      else { winnerLabel = "1"; winProb = pDOM; }
    }
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

  if (winPenaltyFactor < 1) {
    pDOM *= winPenaltyFactor;
    pEXT *= winPenaltyFactor;
  }
  pNUL *= nulBonusFactor;
  const sumAfterPenalty = pDOM + pNUL + pEXT;
  pDOM /= sumAfterPenalty;
  pNUL /= sumAfterPenalty;
  pEXT /= sumAfterPenalty;

  if (modelUsed) {
    const winProbMap: Record<"1" | "X" | "2", number> = {
      "1": pDOM,
      X: pNUL,
      "2": pEXT,
    };
    winProb = winProbMap[winnerLabel as "1" | "X" | "2"] ?? 0.33;
  }

  const impliedH = 1 / oddsHome;
  const impliedD = 1 / oddsDraw;
  const impliedA = 1 / oddsAway;
  let valueBetType: "DOM" | "EXT" | "NUL" | null = null;
  let valueBetMarket = "";
  const winner = winnerLabel === "1" ? homeTeam : winnerLabel === "2" ? awayTeam : "Match Nul";

  const candidates: { i: number; j: number; prob: number }[] = [];
  const bonuses = getScoreBonuses(oddsHome);
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const key = `${i}-${j}`;
      const prior = SCORE_PRIORS[key] ?? 0.15;
      let prob = poisson(i, lH) * poisson(j, lA) * prior;

      // UN SEUL bloc de bonus par score — pas de cumul
      if (i === 0 && j === 0) {
        const bonus00 = oddsDraw < 2.5 ? 2.2 : oddsDraw < 3.0 ? 1.8 : oddsDraw < 4.0 ? 1.2 : 0.7;
        prob *= bonus00;
      } else if (i === 1 && j === 1) {
        const bonus11 = oddsDraw < 3.0 ? 3.5 : oddsDraw < 3.8 ? 2.8 : 1.8;
        prob *= bonus11;
      } else if (i === 2 && j === 2) {
        prob *= 2.0;
      } else if (i === 1 && j === 0) {
        const bonus10 = oddsHome < 1.4 ? 1.8 : oddsHome < 1.8 ? 1.5 : oddsHome < 2.5 ? 1.2 : 0.9;
        prob *= bonus10;
      } else if (i === 0 && j === 1) {
        const bonus01 = oddsAway < 1.4 ? 1.8 : oddsAway < 1.8 ? 1.5 : oddsAway < 2.5 ? 1.2 : 0.9;
        prob *= bonus01;
      } else if (i === 2 && j === 0) {
        const bonus20 = oddsHome < 1.3 ? 1.4 : oddsHome < 1.6 ? 1.1 : oddsHome < 2.0 ? 0.85 : 0.6;
        prob *= bonus20;
      } else if (i === 0 && j === 2) {
        const bonus02 = oddsAway < 1.3 ? 1.4 : oddsAway < 1.6 ? 1.1 : oddsAway < 2.0 ? 0.85 : 0.6;
        prob *= bonus02;
      } else if (i === 2 && j === 1) {
        prob *= 2.2;
      } else if (i === 1 && j === 2) {
        prob *= 2.0;
      } else if (i === 3 && j === 0) {
        prob *= oddsHome < 1.4 ? 1.3 : 0.8;
      } else if (i === 0 && j === 3) {
        prob *= oddsAway < 1.4 ? 1.3 : 0.8;
      } else if (i === 3 && j === 1) {
        prob *= 1.4;
      } else if (i === 1 && j === 3) {
        prob *= 1.2;
      }

      // Pénalités gros scores (inchangées)
      if (i + j >= 7) prob *= 0.35;
      if (i + j === 6 && i !== 6 && j !== 6) prob *= 0.7;
      if (i >= 6 || j >= 6) prob *= 0.3;
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
  const topScores = compatible.slice(0, 3).map((c) => ({ score: `${c.i}-${c.j}`, prob: c.prob }));

  const scoreHome = compatible[0]?.i ?? 1;
  const scoreAway = compatible[0]?.j ?? 0;
  const htHome = Math.round(scoreHome * 0.42);
  const htAway = Math.round(scoreAway * 0.42);
  const htWinner = htHome > htAway ? "1" : htAway > htHome ? "2" : "X";
  const htft = `${htWinner}/${winnerLabel}`;
  const totalGoals = scoreHome + scoreAway;
  const expectedTotal = lH + lA;
  const overUnder = expectedTotal > 2.5 ? "Over 2.5" : "Under 2.5";
  const overUnder35 = expectedTotal > 3.5 ? "Over 3.5" : "Under 3.5";
  const doubleChance = winnerLabel === "1" ? "1X" : winnerLabel === "2" ? "X2" : "1X";

  const confidence = winProb * 100;
  const confidenceStars =
    confidence >= 70 ? 5 : confidence >= 60 ? 4 : confidence >= 50 ? 3 : confidence >= 40 ? 2 : 1;

  const expectedTotalForHot = lH + lA;
  const hotMatch = expectedTotalForHot > 3.0 && Math.abs(pDOM - pEXT) < 0.15;

  // SAFE durci selon données réelles : DOM ≤1.45 (77%), EXT ≤1.5 (53%)
  const confidenceTier: "SAFE" | "MEDIUM" | "AGGRESSIVE" =
    (winnerLabel === "1" && oddsHome <= 1.45 && confidence >= 60) ||
    (winnerLabel === "2" && oddsAway <= 1.5 && confidence >= 60)
      ? "SAFE"
      : confidence >= 55 && !hotMatch
        ? "MEDIUM"
        : "AGGRESSIVE";

  // VALUE BET strict : edge minimum 25% (DOM/EXT) ou 40% (NUL — précision réelle 25%)
  // Cohérent avec winner prédit + confiance suffisante
  if (confidence >= 60 && (confidenceTier === "SAFE" || confidenceTier === "MEDIUM")) {
    if (winnerLabel === "1" && pDOM > impliedH * 1.25 && oddsHome >= 1.5) {
      valueBetType = "DOM";
      valueBetMarket = "1";
    } else if (winnerLabel === "2" && pEXT > impliedA * 1.25 && oddsAway >= 1.5) {
      valueBetType = "EXT";
      valueBetMarket = "2";
    } else if (winnerLabel === "X" && pNUL > impliedD * 1.4 && oddsDraw <= 3.2) {
      valueBetType = "NUL";
      valueBetMarket = "X";
    }
  }

  const isSafeZone =
    (winnerLabel === "1" && oddsHome <= 1.45 && confidence >= 60) ||
    (winnerLabel === "2" && oddsAway <= 1.5 && confidence >= 60);

  // Risky simplifié : faible confiance OU EXT cote haute OU NUL cote haute
  const risky =
    confidence < 50 ||
    (winnerLabel === "2" && oddsAway > 2.5) ||
    (winnerLabel === "X" && oddsDraw > 3.2);

  const entropy = -topScores.reduce((s, c) => s + (c.prob > 0 ? c.prob * Math.log2(c.prob) : 0), 0);
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
    overUnder35,
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
    isSafeZone,
  };
}
