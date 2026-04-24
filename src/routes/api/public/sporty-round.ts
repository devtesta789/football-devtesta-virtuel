import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://hg-event-api-prod.sporty-tech.net/api/instantleagues";

const UPSTREAM_HEADERS = {
  Accept: "application/json",
  Origin: "https://bet261.mg",
  Referer: "https://bet261.mg/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

function buildHeaders(): Record<string, string> {
  const key = process.env.SPORTY_TECH_API_KEY;
  const h: Record<string, string> = { ...UPSTREAM_HEADERS };
  if (key) {
    h["Authorization"] = `Bearer ${key}`;
    h["x-api-key"] = key;
  }
  return h;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: buildHeaders() });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const catCache = new Map<string, { id: string; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const SCAN_FROM = 142800;
const SCAN_TO = 143400;

async function discoverCategoryId(leagueId: string): Promise<string | null> {
  const cached = catCache.get(leagueId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.id;

  const BATCH = 20;
  let bestCat: number | null = null;
  for (let start = SCAN_TO; start >= SCAN_FROM; start -= BATCH) {
    const ids: number[] = [];
    for (let i = 0; i < BATCH && start - i >= SCAN_FROM; i++) ids.push(start - i);
    const results = await Promise.all(
      ids.map(async (cat) => {
        const data = (await fetchJson(
          `${BASE}/round/1?eventCategoryId=${cat}&getNext=false`,
        )) as { round?: { matches?: { entryPointId?: number | string }[] } } | null;
        return data?.round?.matches?.[0] &&
          String(data.round.matches[0].entryPointId) === leagueId
          ? cat
          : null;
      }),
    );
    for (const c of results) if (c !== null && (bestCat === null || c > bestCat)) bestCat = c;
    if (bestCat !== null) break;
  }

  if (bestCat !== null) {
    catCache.set(leagueId, { id: String(bestCat), ts: Date.now() });
    return String(bestCat);
  }
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/public/sporty-round")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "round";
        const leagueId = url.searchParams.get("leagueId") ?? "8035";
        let eventCategoryId = url.searchParams.get("eventCategoryId") ?? "";

        const roundParam = url.searchParams.get("round");
        if (
          roundParam &&
          (!/^\d{1,2}$/.test(roundParam) ||
            Number(roundParam) < 1 ||
            Number(roundParam) > 38)
        ) {
          return Response.json(
            { success: false, error: "Invalid round" },
            { status: 400, headers: corsHeaders },
          );
        }
        if (!/^\d{1,8}$/.test(leagueId)) {
          return Response.json(
            { success: false, error: "Invalid leagueId" },
            { status: 400, headers: corsHeaders },
          );
        }
        if (eventCategoryId && !/^\d{1,10}$/.test(eventCategoryId)) {
          return Response.json(
            { success: false, error: "Invalid eventCategoryId" },
            { status: 400, headers: corsHeaders },
          );
        }

        try {
          if (action === "discover") {
            const id = await discoverCategoryId(leagueId);
            return Response.json(
              { success: !!id, data: { leagueId, eventCategoryId: id } },
              { status: id ? 200 : 404, headers: corsHeaders },
            );
          }

          if (action === "discoverAll") {
            const BATCH = 30;
            const candidates: { id: string; roundCount: number }[] = [];
            for (let start = SCAN_TO; start >= SCAN_FROM; start -= BATCH) {
              const ids: number[] = [];
              for (let i = 0; i < BATCH && start - i >= SCAN_FROM; i++)
                ids.push(start - i);
              const results = await Promise.all(
                ids.map(async (cat) => {
                  const data = (await fetchJson(
                    `${BASE}/round/1?eventCategoryId=${cat}&getNext=false`,
                  )) as {
                    round?: { matches?: { entryPointId?: number | string }[] };
                  } | null;
                  const matches = data?.round?.matches ?? [];
                  if (
                    matches.length > 0 &&
                    String(matches[0].entryPointId) === leagueId
                  ) {
                    return { id: String(cat), roundCount: matches.length };
                  }
                  return null;
                }),
              );
              for (const r of results) if (r) candidates.push(r);
              if (candidates.length >= 5) break;
            }
            candidates.sort((a, b) => b.roundCount - a.roundCount);
            return Response.json(
              { success: true, data: { categories: candidates } },
              { status: 200, headers: corsHeaders },
            );
          }

          if (!eventCategoryId) {
            const found = await discoverCategoryId(leagueId);
            if (!found)
              return Response.json(
                { success: false, error: `eventCategoryId introuvable` },
                { status: 404, headers: corsHeaders },
              );
            eventCategoryId = found;
          }

          const round = url.searchParams.get("round");
          if (action === "results" && round) {
            const [matchesRes, playoutRes] = await Promise.all([
              fetchJson(
                `${BASE}/round/${round}?eventCategoryId=${eventCategoryId}&getNext=false`,
              ),
              fetchJson(
                `${BASE}/round/${round}/playout?eventCategoryId=${eventCategoryId}&parentEventCategoryId=${leagueId}`,
              ),
            ]);
            return Response.json(
              {
                success: true,
                data: {
                  round: Number(round),
                  matches: matchesRes,
                  playout: playoutRes,
                },
                eventCategoryId,
              },
              { status: 200, headers: corsHeaders },
            );
          }

          let target = "";
          if (action === "round" && round)
            target = `${BASE}/round/${round}?eventCategoryId=${eventCategoryId}&getNext=false`;
          else if (action === "playout" && round)
            target = `${BASE}/round/${round}/playout?eventCategoryId=${eventCategoryId}&parentEventCategoryId=${leagueId}`;
          else
            return Response.json(
              { success: false, error: "Unknown action" },
              { status: 400, headers: corsHeaders },
            );

          const r = await fetch(target, { headers: buildHeaders() });
          const text = await r.text();
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
          return Response.json(
            { success: r.ok, data, eventCategoryId },
            { status: r.status, headers: corsHeaders },
          );
        } catch {
          return Response.json(
            { success: false, error: "Internal error" },
            { status: 500, headers: corsHeaders },
          );
        }
      },
    },
  },
});
