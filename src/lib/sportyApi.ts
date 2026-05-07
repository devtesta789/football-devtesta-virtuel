import { TEAMS } from "./prediction";

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const TEAM_NORMS = TEAMS.map((t) => ({ team: t, key: norm(t) }));

export function matchTeam(input: string): string | null {
  if (!input) return null;
  const n = norm(input);
  for (const { team, key } of TEAM_NORMS) if (key === n) return team;
  for (const { team, key } of TEAM_NORMS) if (n.includes(key) || key.includes(n)) return team;

  let best: { team: string; score: number } | null = null;
  for (const { team, key } of TEAM_NORMS) {
    let common = 0;
    for (let i = 0; i < Math.min(n.length, key.length); i++) if (n[i] === key[i]) common++;
    const score = common / Math.max(n.length, key.length);
    if (!best || score > best.score) best = { team, score };
  }
  return best && best.score >= 0.5 ? best.team : null;
}

export interface SportyMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  oddsHome: string;
  oddsDraw: string;
  oddsAway: string;
  rawHome: string;
  rawAway: string;
  matched: boolean;
  finalScoreHome?: number;
  finalScoreAway?: number;
  played: boolean;
  matchTime?: string;
}

interface ApiBetItem {
  shortName?: string;
  odds?: number;
}
interface ApiBetType {
  name?: string;
  eventBetTypeItems?: ApiBetItem[];
}
interface ApiEvent {
  id?: number;
  homeTeam?: { name?: string } | string;
  awayTeam?: { name?: string } | string;
  home?: string;
  away?: string;
  eventBetTypes?: ApiBetType[];
  markets?: ApiBetType[];
  startDate?: string;
}
interface ApiGoal {
  minute?: number;
  homeScore?: number;
  awayScore?: number;
}
interface ApiPlayoutMatch {
  id?: number;
  goals?: ApiGoal[];
}

function teamName(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
}

function extract1X2(ev: ApiEvent): { h: number; d: number; a: number } | null {
  const types = ev.eventBetTypes ?? ev.markets ?? [];
  for (const m of types) {
    if ((m.name ?? "").toLowerCase().trim() !== "1x2") continue;
    const items = m.eventBetTypeItems ?? [];
    let h = 0,
      d = 0,
      a = 0;
    for (const o of items) {
      const lbl = (o.shortName ?? "").toUpperCase();
      const price = Number(o.odds ?? 0);
      if (lbl === "1") h = price;
      else if (lbl === "X") d = price;
      else if (lbl === "2") a = price;
    }
    if (h > 1 && d > 1 && a > 1) return { h, d, a };
  }
  return null;
}

function finalFromGoals(goals: ApiGoal[] | undefined): { h: number; a: number } | null {
  if (!goals) return null; // pas de playout → match non joué
  if (goals.length === 0) return { h: 0, a: 0 }; // playout vide → score 0-0
  const last = goals[goals.length - 1];
  if (typeof last.homeScore === "number" && typeof last.awayScore === "number") {
    return { h: Math.round(last.homeScore), a: Math.round(last.awayScore) };
  }
  return null;
}

// Local cache to keep scores even after the API category rotates to a new season.
// Sporty-Tech's virtual league recycles eventCategoryId quickly, so observed scores
// must be persisted client-side or they become permanently unreachable.
const SCORE_CACHE_KEY = "sporty.scoreCache.v1";
type ScoreCache = Record<string, { h: number; a: number; ts: number }>;

function scoreKey(round: number | string, home: string, away: string): string {
  return `${round}|${home}|${away}`;
}

function loadScoreCache(): ScoreCache {
  try {
    return JSON.parse(localStorage.getItem(SCORE_CACHE_KEY) ?? "{}") as ScoreCache;
  } catch {
    return {};
  }
}

function saveScoreCache(c: ScoreCache) {
  try {
    localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota */
  }
}

export function rememberScore(
  round: number | string,
  home: string,
  away: string,
  h: number,
  a: number,
) {
  const c = loadScoreCache();
  c[scoreKey(round, home, away)] = { h, a, ts: Date.now() };
  saveScoreCache(c);
}

export function recallScore(
  round: number | string,
  home: string,
  away: string,
): { h: number; a: number } | null {
  const c = loadScoreCache();
  const v = c[scoreKey(round, home, away)];
  return v ? { h: v.h, a: v.a } : null;
}

export function getCachedScoreCount(): number {
  return Object.keys(loadScoreCache()).length;
}

/**
 * Bulk-seed the local score cache from a remote source (e.g. validated
 * predictions in Supabase). Useful to fill partial rounds whose scores
 * have already been observed once but are no longer exposed by the API.
 */
export function seedScoreCache(scores: Record<string, { home: number; away: number }>): number {
  const c = loadScoreCache();
  let added = 0;
  for (const [key, v] of Object.entries(scores)) {
    if (!c[key]) added++;
    c[key] = { h: v.home, a: v.away, ts: Date.now() };
  }
  saveScoreCache(c);
  return added;
}

/**
 * Re-scans only the partial rounds (where played < total) by re-fetching
 * each of them. Returns how many new scores were captured into the cache.
 * Use this to incrementally complete rounds whose results dripped in
 * between earlier scans.
 */
export async function rescanPartialRounds(
  leagueId: string,
  eventCategoryId: string,
  partialRounds: number[],
  concurrency = 4,
): Promise<{ filled: number; statuses: RoundStatus[] }> {
  const before = loadScoreCache();
  const beforeKeys = new Set(Object.keys(before));
  const newStatuses: RoundStatus[] = [];

  const chunks: number[][] = [];
  for (let i = 0; i < partialRounds.length; i += concurrency) {
    chunks.push(partialRounds.slice(i, i + concurrency));
  }
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (r) => {
        try {
          const { matches } = await fetchRound(leagueId, String(r), eventCategoryId);
          return {
            round: r,
            total: matches.length,
            played: matches.filter((m) => m.played).length,
          };
        } catch {
          return { round: r, total: 0, played: 0 };
        }
      }),
    );
    newStatuses.push(...results);
  }

  const after = loadScoreCache();
  let filled = 0;
  for (const k of Object.keys(after)) if (!beforeKeys.has(k)) filled++;

  return { filled, statuses: newStatuses.sort((a, b) => a.round - b.round) };
}

export function combineRoundData(
  matchesJson: unknown,
  playoutJson: unknown,
  roundNumber?: number | string,
  useCache = true,
): SportyMatch[] {
  const md = matchesJson as { round?: { matches?: ApiEvent[] } } | null;
  const events = md?.round?.matches ?? [];

  const pd = playoutJson as { matches?: ApiPlayoutMatch[] } | null;
  const playoutMap = new Map<number, ApiGoal[]>();
  for (const pm of pd?.matches ?? []) {
    if (typeof pm.id === "number") playoutMap.set(pm.id, pm.goals ?? []);
  }

  const out: SportyMatch[] = [];
  for (const ev of events) {
    const rawHome = teamName(ev.homeTeam) || ev.home || "";
    const rawAway = teamName(ev.awayTeam) || ev.away || "";
    if (!rawHome || !rawAway) continue;
    const odds = extract1X2(ev);
    const mh = matchTeam(rawHome);
    const ma = matchTeam(rawAway);
    const mid = ev.id ?? 0;
    const goals = playoutMap.get(mid);
    let score = finalFromGoals(goals);

    const homeName = mh ?? rawHome;
    const awayName = ma ?? rawAway;

    // Persist newly observed scores so they survive category rotation
    if (score && roundNumber !== undefined) {
      rememberScore(roundNumber, homeName, awayName, score.h, score.a);
    }

    // Fallback: recover from local cache when the API no longer exposes the score
    // Disabled during scans (useCache=false) so partial rounds reflect API truth.
    if (!score && useCache && roundNumber !== undefined) {
      const cached = recallScore(roundNumber, homeName, awayName);
      if (cached) score = cached;
    }

    out.push({
      matchId: mid,
      homeTeam: homeName,
      awayTeam: awayName,
      oddsHome: odds ? odds.h.toFixed(2) : "",
      oddsDraw: odds ? odds.d.toFixed(2) : "",
      oddsAway: odds ? odds.a.toFixed(2) : "",
      rawHome,
      rawAway,
      matched: !!(mh && ma),
      finalScoreHome: score?.h,
      finalScoreAway: score?.a,
      played: !!score,
      matchTime: ev.startDate,
    });
  }
  return out;
}

interface ApiEnvelope {
  success: boolean;
  data?: unknown;
  error?: string;
  eventCategoryId?: string;
}

async function callProxy(params: Record<string, string>): Promise<ApiEnvelope> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`/api/public/sporty-round?${qs}`);
  const json = (await r.json()) as ApiEnvelope;
  if (!r.ok || !json.success) throw new Error(json.error ?? `API ${r.status}`);
  return json;
}

export async function discoverCategory(leagueId: string): Promise<string> {
  const env = await callProxy({ action: "discover", leagueId });
  const data = env.data as { eventCategoryId?: string } | undefined;
  if (!data?.eventCategoryId) throw new Error("eventCategoryId not found");
  return data.eventCategoryId;
}

export async function discoverAllCategories(
  leagueId: string,
): Promise<{ id: string; roundCount: number }[]> {
  const env = await callProxy({ action: "discoverAll", leagueId });
  const data = env.data as { categories?: { id: string; roundCount: number }[] } | undefined;
  return data?.categories ?? [];
}

export async function fetchRound(
  leagueId: string,
  round: string,
  eventCategoryId?: string,
  useCache = true,
): Promise<{ matches: SportyMatch[]; eventCategoryId: string }> {
  const params: Record<string, string> = { action: "results", leagueId, round };
  if (eventCategoryId) params.eventCategoryId = eventCategoryId;
  const env = await callProxy(params);
  const data = env.data as { matches?: unknown; playout?: unknown } | undefined;
  const matches = combineRoundData(data?.matches, data?.playout, round, useCache);
  return { matches, eventCategoryId: env.eventCategoryId ?? eventCategoryId ?? "" };
}

export function formatMatchTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export interface RoundStatus {
  round: number;
  total: number;
  played: number;
}

export async function scanRoundStatuses(
  leagueId: string,
  eventCategoryId: string,
  maxRound = 38,
  concurrency = 20,
): Promise<RoundStatus[]> {
  const out: RoundStatus[] = [];
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const fetchOne = async (r: number): Promise<RoundStatus | null> => {
    try {
      // useCache=false: rely on API truth so partial rounds reflect actual state
      const { matches } = await fetchRound(leagueId, String(r), eventCategoryId, false);
      return {
        round: r,
        total: matches.length,
        played: matches.filter((m) => m.played).length,
      };
    } catch {
      return { round: r, total: 0, played: 0 };
    }
  };

  const chunks: number[][] = [];
  for (let i = 0; i < rounds.length; i += concurrency) {
    chunks.push(rounds.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(fetchOne));
    out.push(...results.filter((r): r is RoundStatus => r !== null));
  }

  return out.sort((a, b) => a.round - b.round);
}

export async function fetchAllPlayedMatches(
  leagueId: string,
  eventCategoryId: string,
  maxRound = 38,
  concurrency = 20,
): Promise<{ round: number; matches: SportyMatch[] }[]> {
  const out: { round: number; matches: SportyMatch[] }[] = [];
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const fetchOne = async (r: number): Promise<{ round: number; matches: SportyMatch[] } | null> => {
    try {
      // useCache=false during scans
      const { matches } = await fetchRound(leagueId, String(r), eventCategoryId, false);
      const played = matches.filter((m) => m.played);
      if (played.length) return { round: r, matches: played };
      return null;
    } catch {
      return null;
    }
  };

  const chunks: number[][] = [];
  for (let i = 0; i < rounds.length; i += concurrency) {
    chunks.push(rounds.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(fetchOne));
    out.push(...results.filter((r): r is { round: number; matches: SportyMatch[] } => r !== null));
  }

  return out.sort((a, b) => a.round - b.round);
}
