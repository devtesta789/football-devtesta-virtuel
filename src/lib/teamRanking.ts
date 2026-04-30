import type { SportyMatch } from "./sportyApi";

export interface TeamStats {
  teamName: string;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  homeWins: number;
  homeDraws: number;
  homeLosses: number;
  awayWins: number;
  awayDraws: number;
  awayLosses: number;
  recentForm: string;
  recentFormPoints: number;
  homePointsPerMatch: number;
  awayPointsPerMatch: number;
}

const STORAGE_KEY = "sporty.teamStats.v1";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resultValue(result: "W" | "D" | "L") {
  return result === "W" ? 1 : result === "D" ? 0.5 : 0;
}

function computeRecentForm(form: ("W" | "D" | "L")[]) {
  const recent = form.slice(-5);
  const total = recent.reduce((acc, result, index) => acc + resultValue(result) * (index + 1), 0);
  return {
    recentForm: recent.join(""),
    recentFormPoints: total,
  };
}

function emptyStats(teamName: string): TeamStats {
  return {
    teamName,
    played: 0,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    homeWins: 0,
    homeDraws: 0,
    homeLosses: 0,
    awayWins: 0,
    awayDraws: 0,
    awayLosses: 0,
    recentForm: "",
    recentFormPoints: 0,
    homePointsPerMatch: 0,
    awayPointsPerMatch: 0,
  };
}

export function computeTeamStats(matches: SportyMatch[]): TeamStats[] {
  const map: Record<string, TeamStats & { formHistory: ("W" | "D" | "L")[] }> = {};

  function team(name: string) {
    if (!map[name]) {
      map[name] = { ...emptyStats(name), formHistory: [] };
    }
    return map[name];
  }

  for (const match of matches) {
    if (match.finalScoreHome === undefined || match.finalScoreAway === undefined) continue;
    const home = team(match.homeTeam);
    const away = team(match.awayTeam);
    const homeGoals = match.finalScoreHome;
    const awayGoals = match.finalScoreAway;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;
    home.goalDiff = home.goalsFor - home.goalsAgainst;
    away.goalDiff = away.goalsFor - away.goalsAgainst;

    home.homePointsPerMatch = home.homeWins * 3 + home.homeDraws;
    away.awayPointsPerMatch = away.awayWins * 3 + away.awayDraws;

    if (homeGoals > awayGoals) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      home.homeWins += 1;
      away.awayLosses += 1;
      home.formHistory.push("W");
      away.formHistory.push("L");
    } else if (homeGoals === awayGoals) {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
      home.homeDraws += 1;
      away.awayDraws += 1;
      home.formHistory.push("D");
      away.formHistory.push("D");
    } else {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      away.awayWins += 1;
      home.homeLosses += 1;
      home.formHistory.push("L");
      away.formHistory.push("W");
    }

    if (match.homeTeam && match.awayTeam) {
      // Keep home/away points per match values up to date
      home.homePointsPerMatch = home.homeWins * 3 + home.homeDraws;
      away.awayPointsPerMatch = away.awayWins * 3 + away.awayDraws;
    }
  }

  const teams = Object.values(map).map((stats) => {
    const homeMatches = stats.homeWins + stats.homeDraws + stats.homeLosses;
    const awayMatches = stats.awayWins + stats.awayDraws + stats.awayLosses;
    const { recentForm, recentFormPoints } = computeRecentForm(stats.formHistory);
    return {
      teamName: stats.teamName,
      played: stats.played,
      points: stats.points,
      wins: stats.wins,
      draws: stats.draws,
      losses: stats.losses,
      goalsFor: stats.goalsFor,
      goalsAgainst: stats.goalsAgainst,
      goalDiff: stats.goalDiff,
      homeWins: stats.homeWins,
      homeDraws: stats.homeDraws,
      homeLosses: stats.homeLosses,
      awayWins: stats.awayWins,
      awayDraws: stats.awayDraws,
      awayLosses: stats.awayLosses,
      recentForm,
      recentFormPoints,
      homePointsPerMatch: homeMatches ? stats.homePointsPerMatch / homeMatches : 0,
      awayPointsPerMatch: awayMatches ? stats.awayPointsPerMatch / awayMatches : 0,
    };
  });

  teams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return b.recentFormPoints - a.recentFormPoints;
  });

  return teams;
}

export function saveTeamStatsToStorage(stats: Record<string, TeamStats>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, stats }));
  } catch {
    // ignore quota errors
  }
}

export function loadTeamStatsFromStorage(): Record<string, TeamStats> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version: number; stats: Record<string, TeamStats> };
    return parsed?.stats ?? {};
  } catch {
    return {};
  }
}

export function getTeamFormAdjustment(homeTeam: string, awayTeam: string) {
  const teamStats = loadTeamStatsFromStorage();
  const home = teamStats[homeTeam];
  const away = teamStats[awayTeam];
  if (!home || !away) return { homeFactor: 1, awayFactor: 1 };

  const formDelta = home.recentFormPoints - away.recentFormPoints;
  const venueEdge = home.homePointsPerMatch - away.awayPointsPerMatch;
  const formEdge = (home.goalsFor - home.goalsAgainst) / Math.max(home.played, 1) -
    (away.goalsFor - away.goalsAgainst) / Math.max(away.played, 1);

  const homeFactor = clamp(1 + formDelta * 0.008 + venueEdge * 0.05 + formEdge * 0.02, 0.85, 1.18);
  const awayFactor = clamp(1 - formDelta * 0.006 + (away.awayPointsPerMatch - home.homePointsPerMatch) * 0.04 - formEdge * 0.015, 0.88, 1.15);

  return { homeFactor, awayFactor };
}
