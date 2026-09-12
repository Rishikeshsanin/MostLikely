import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { calculateFinalResults, calculateRoundResult, selectQuestion } from "./game.ts";
import type { Pack } from "./questions.ts";

const APP_SLUG = "most_likely";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const sql = postgres(DB_URL, { max: 2, prepare: false, idle_timeout: 20 });

const COLORS = ["#c4b5fd", "#fda4af", "#86efac", "#fde68a", "#93c5fd", "#f0abfc", "#67e8f9", "#fdba74", "#a7f3d0", "#f9a8d4"];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

type Row = Record<string, any>;
type ActionBody = { op?: string; [key: string]: unknown };

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: CORS });
}
function ok(data: unknown) { return response(200, { ok: true, data }); }
function fail(status: number, error: string, code?: string, details?: unknown) {
  return response(status, { ok: false, error, code, details });
}
function cleanCode(value: unknown) { return String(value ?? "").replace(/\D/g, "").slice(0, 4); }
function cleanName(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24); }
function normalizeQuestion(value: unknown) {
  const text = String(value ?? "")
    .trim()
    .replace(/^who\s+(would|is\s+most\s+likely\s+to)\s*/i, "")
    .replace(/^\.\.\./, "")
    .replace(/^to\s+/i, "")
    .replace(/\?+$/, "")
    .trim()
    .slice(0, 150);
  return text ? `${text}?` : "";
}
function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}
async function hashToken(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function roomCode() { return String(1000 + Math.floor(Math.random() * 9000)); }

function publishableKey() {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      // Fall back to the browser-safe legacy anon key if needed.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

async function assertHubScope() {
  const rows = await sql<Row[]>`select hub.assert_app_scope(${APP_SLUG}, ${APP_SLUG}) as ok`;
  if (!rows.length) throw new Error("Project Hub scope assertion failed.");
}

async function broadcast(code: string) {
  const key = publishableKey();
  if (!SUPABASE_URL || !key) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{
          topic: `${APP_SLUG}:room:${code}`,
          event: "state_changed",
          payload: { at: Date.now() }
        }]
      })
    });
  } catch {
    // Polling is the authoritative fallback if a realtime signal is missed.
  }
}

async function touchRoom(roomId: string) {
  await sql`
    update most_likely.rooms
       set last_activity_at = now(), expires_at = now() + interval '6 hours'
     where id = ${roomId}::uuid
  `;
}
async function pruneExpired() {
  await sql`delete from most_likely.rooms where expires_at < now()`;
}
async function getRoom(code: string) {
  const rows = await sql<Row[]>`
    select * from most_likely.rooms
     where code = ${code} and expires_at >= now()
     limit 1
  `;
  return rows[0] ?? null;
}
async function authenticate(code: string, rawToken: string) {
  const room = await getRoom(code);
  if (!room) return null;
  const digest = await hashToken(rawToken);
  const rows = await sql<Row[]>`
    select * from most_likely.players
     where room_id = ${room.id}::uuid
       and session_token_hash = ${digest}
       and kicked = false
     limit 1
  `;
  const player = rows[0];
  return player ? { room, player } : null;
}
async function requireHost(code: string, rawToken: string) {
  const auth = await authenticate(code, rawToken);
  if (!auth || !auth.player.is_host || auth.room.host_player_id !== auth.player.id) return null;
  return auth;
}

async function createRound(room: Row, roundNumber: number, players: Row[]) {
  const history = Array.isArray(room.question_history) ? room.question_history.map(String) : [];
  const recentRounds = await sql<Row[]>`
    select topic from most_likely.rounds
     where room_id = ${room.id}::uuid
     order by round_number desc
     limit 3
  `;
  const q = selectQuestion({
    pack: room.pack as Pack,
    usedIds: history,
    recentTopics: recentRounds.map((r) => String(r.topic)),
    customQuestions: Array.isArray(room.custom_questions) ? room.custom_questions : []
  });
  if (!q) throw new Error("No unused questions remain in this room.");
  const eligible = players.filter((p) => !p.kicked).map((p) => String(p.id));
  const rounds = await sql<Row[]>`
    insert into most_likely.rounds (
      room_id, question_id, question_text, question_pack, award_category,
      tone, topic, allow_self, round_number, phase, eligible_player_ids
    ) values (
      ${room.id}::uuid, ${q.id}, ${q.text}, ${q.pack}, ${q.awardCategory ?? null},
      ${q.tone}, ${q.topic}, ${q.allowSelf}, ${roundNumber}, 'voting', ${sql.array(eligible)}::uuid[]
    ) returning *
  `;
  const round = rounds[0];
  await sql`
    update most_likely.rooms
       set status = 'active', phase = 'voting', round_number = ${roundNumber},
           current_round_id = ${round.id}::uuid,
           question_history = ${sql.array([...history, q.id])}::text[]
     where id = ${room.id}::uuid
  `;
  return round;
}

async function buildState(room: Row, me: Row) {
  const players = await sql<Row[]>`
    select id, name, color, initial, is_host, join_order, last_seen_at, kicked
      from most_likely.players
     where room_id = ${room.id}::uuid and kicked = false
     order by join_order
  `;
  const publicPlayers = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    initial: p.initial,
    isHost: p.is_host,
    joinOrder: p.join_order,
    connected: Date.now() - new Date(p.last_seen_at).getTime() < 90_000
  }));

  let roundOut: Record<string, unknown> | null = null;
  let voting: Record<string, unknown> | null = null;
  if (room.current_round_id) {
    const rounds = await sql<Row[]>`
      select * from most_likely.rounds where id = ${room.current_round_id}::uuid limit 1
    `;
    const round = rounds[0];
    if (round) {
      const votes = await sql<Row[]>`
        select voter_id from most_likely.votes where round_id = ${round.id}::uuid
      `;
      const voterIds = new Set(votes.map((v) => String(v.voter_id)));
      const eligibleIds = Array.isArray(round.eligible_player_ids) ? round.eligible_player_ids.map(String) : [];
      voting = {
        voted: voterIds.size,
        eligible: eligibleIds.length,
        hasVoted: voterIds.has(String(me.id)),
        ...(me.is_host ? {
          pendingNames: publicPlayers
            .filter((p) => eligibleIds.includes(String(p.id)) && !voterIds.has(String(p.id)))
            .map((p) => p.name)
        } : {})
      };
      roundOut = {
        id: round.id,
        roundNumber: round.round_number,
        questionId: round.question_id,
        questionText: round.question_text,
        awardCategory: round.award_category,
        tone: round.tone,
        allowSelf: round.allow_self,
        phase: round.phase,
        eligiblePlayerIds: eligibleIds,
        result: round.result,
        revealedAt: round.revealed_at
      };
    }
  }

  return {
    room: {
      code: room.code,
      status: room.status,
      phase: room.phase,
      pack: room.pack,
      roundNumber: room.round_number,
      customQuestions: Array.isArray(room.custom_questions) ? room.custom_questions : [],
      createdAt: room.created_at
    },
    me: publicPlayers.find((p) => p.id === me.id) ?? {
      id: me.id, name: me.name, color: me.color, initial: me.initial,
      isHost: me.is_host, connected: true, joinOrder: me.join_order
    },
    players: publicPlayers,
    round: roundOut,
    voting,
    final: room.final_results,
    serverTime: new Date().toISOString()
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Method not allowed.");
  if (!DB_URL) return fail(500, "Game backend is not configured.");

  let body: ActionBody;
  try { body = (await req.json()) as ActionBody; }
  catch { return fail(400, "Invalid request."); }
  const op = String(body.op ?? "");

  try {
    await assertHubScope();

    if (op === "create") {
      const name = cleanName(body.name);
      if (name.length < 2) return fail(400, "Please enter a name with at least 2 characters.");
      await pruneExpired();
      for (let attempt = 0; attempt < 20; attempt++) {
        const code = roomCode();
        try {
          const created = await sql.begin(async (tx) => {
            const rooms = await tx<Row[]>`
              insert into most_likely.rooms (code, pack) values (${code}, 'mixed') returning *
            `;
            const room = rooms[0];
            const raw = newToken();
            const digest = await hashToken(raw);
            const players = await tx<Row[]>`
              insert into most_likely.players (
                room_id, name, name_key, color, initial, session_token_hash, is_host, join_order
              ) values (
                ${room.id}::uuid, ${name}, ${name.toLowerCase()}, ${COLORS[0]},
                ${name[0].toUpperCase()}, ${digest}, true, 1
              ) returning *
            `;
            const player = players[0];
            await tx`update most_likely.rooms set host_player_id = ${player.id}::uuid where id = ${room.id}::uuid`;
            return { code, playerId: player.id, token: raw, name };
          });
          await broadcast(code);
          return ok(created);
        } catch (error) {
          if (errorCode(error) === "23505") continue;
          throw error;
        }
      }
      return fail(503, "Could not create a room code. Try again.");
    }

    if (op === "join") {
      const code = cleanCode(body.code);
      const name = cleanName(body.name);
      if (code.length !== 4 || name.length < 2) return fail(400, "Enter a valid room code and name.");
      const room = await getRoom(code);
      if (!room) return fail(404, "That room does not exist or has expired.", "ROOM_NOT_FOUND");
      if (room.status !== "lobby") return fail(409, "That game has already started.", "ROOM_STARTED");
      const existing = await sql<Row[]>`
        select id from most_likely.players
         where room_id = ${room.id}::uuid and name_key = ${name.toLowerCase()} and kicked = false
         limit 1
      `;
      if (existing.length) return fail(409, "Someone in this room is already using that name.", "DUPLICATE_NAME");
      const activePlayers = await sql<Row[]>`
        select id, join_order from most_likely.players
         where room_id = ${room.id}::uuid and kicked = false order by join_order
      `;
      if (activePlayers.length >= 10) return fail(409, "This room is full.", "ROOM_FULL");
      const usedSlots = new Set(activePlayers.map((p) => Number(p.join_order)));
      const joinOrder = Array.from({ length: 10 }, (_, i) => i + 1).find((slot) => !usedSlots.has(slot));
      if (!joinOrder) return fail(409, "This room is full.", "ROOM_FULL");
      const raw = newToken();
      const digest = await hashToken(raw);
      try {
        const players = await sql<Row[]>`
          insert into most_likely.players (
            room_id, name, name_key, color, initial, session_token_hash, join_order
          ) values (
            ${room.id}::uuid, ${name}, ${name.toLowerCase()},
            ${COLORS[(joinOrder - 1) % COLORS.length]}, ${name[0].toUpperCase()}, ${digest}, ${joinOrder}
          ) returning *
        `;
        const player = players[0];
        await touchRoom(room.id);
        await broadcast(code);
        return ok({ code, playerId: player.id, token: raw, name });
      } catch (error) {
        if (errorCode(error) === "23505") return fail(409, "That name or player slot was just taken. Try again.", "JOIN_CONFLICT");
        throw error;
      }
    }

    const code = cleanCode(body.code);
    const rawToken = String(body.token ?? "");
    if (code.length !== 4 || !rawToken) return fail(401, "Your room session is missing. Rejoin the room.");

    if (op === "state" || op === "heartbeat") {
      const auth = await authenticate(code, rawToken);
      if (!auth) return fail(401, "This room session is no longer valid. Rejoin the room.", "INVALID_SESSION");
      await sql`update most_likely.players set last_seen_at = now() where id = ${auth.player.id}::uuid`;
      if (op === "heartbeat") return ok({ alive: true });
      const refreshedRoom = await getRoom(code);
      if (!refreshedRoom) return fail(404, "That room has expired.", "ROOM_NOT_FOUND");
      return ok(await buildState(refreshedRoom, { ...auth.player, last_seen_at: new Date().toISOString() }));
    }

    if (op === "configure") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can change room settings.");
      if (auth.room.status !== "lobby") return fail(409, "Game settings are locked after the game starts.");
      const pack = ["chill", "chaos", "savage", "wholesome", "mixed"].includes(String(body.pack)) ? String(body.pack) : "mixed";
      const custom = Array.isArray(body.customQuestions)
        ? body.customQuestions.slice(0, 15).map((raw, i) => {
            const q = (raw ?? {}) as Record<string, unknown>;
            const tone = ["funny", "chaos", "wholesome", "savage"].includes(String(q.tone)) ? String(q.tone) : "funny";
            return { id: `custom_${i + 1}_${crypto.randomUUID().slice(0, 8)}`, text: normalizeQuestion(q.text), tone };
          }).filter((q) => q.text.length >= 8)
        : [];
      await sql`
        update most_likely.rooms
           set pack = ${pack}, custom_questions = ${sql.json(custom)},
               last_activity_at = now(), expires_at = now() + interval '6 hours'
         where id = ${auth.room.id}::uuid
      `;
      await broadcast(code);
      return ok({ saved: true });
    }

    if (op === "kick") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can remove players.");
      if (auth.room.status !== "lobby") return fail(409, "Players can only be removed before the game starts.");
      const target = String(body.playerId ?? "");
      if (!target || target === auth.player.id) return fail(400, "That player cannot be removed.");
      await sql`
        update most_likely.players set kicked = true
         where id = ${target}::uuid and room_id = ${auth.room.id}::uuid and is_host = false
      `;
      await touchRoom(auth.room.id);
      await broadcast(code);
      return ok({ removed: true });
    }

    if (op === "start") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can start the game.");
      if (auth.room.status !== "lobby") return fail(409, "This game has already started.");
      const players = await sql<Row[]>`
        select * from most_likely.players
         where room_id = ${auth.room.id}::uuid and kicked = false order by join_order
      `;
      if (players.length < 3) return fail(409, "You need at least 3 players to start.");
      await createRound(auth.room, 1, players);
      await touchRoom(auth.room.id);
      await broadcast(code);
      return ok({ started: true });
    }

    if (op === "vote") {
      const auth = await authenticate(code, rawToken);
      if (!auth) return fail(401, "Your room session is no longer valid.");
      if (auth.room.status !== "active" || auth.room.phase !== "voting" || !auth.room.current_round_id) {
        return fail(409, "Voting is not open right now.");
      }
      const rounds = await sql<Row[]>`
        select * from most_likely.rounds where id = ${auth.room.current_round_id}::uuid limit 1
      `;
      const round = rounds[0];
      if (!round) return fail(409, "This round is no longer active.");
      const eligibleIds = Array.isArray(round.eligible_player_ids) ? round.eligible_player_ids.map(String) : [];
      if (!eligibleIds.includes(String(auth.player.id))) return fail(403, "You are not eligible to vote in this round.");
      const target = String(body.targetPlayerId ?? "");
      if (!eligibleIds.includes(target)) return fail(400, "Choose a player in this room.");
      if (!round.allow_self && target === auth.player.id) return fail(400, "You cannot vote for yourself this round.");
      try {
        await sql`
          insert into most_likely.votes (round_id, voter_id, target_player_id)
          values (${round.id}::uuid, ${auth.player.id}::uuid, ${target}::uuid)
        `;
      } catch (error) {
        if (errorCode(error) === "23505") return fail(409, "Your vote is already locked.", "VOTE_LOCKED");
        throw error;
      }
      await touchRoom(auth.room.id);
      await broadcast(code);
      return ok({ locked: true });
    }

    if (op === "reveal") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can reveal votes.");
      if (auth.room.phase !== "voting" || !auth.room.current_round_id) return fail(409, "There is nothing to reveal right now.");
      const rounds = await sql<Row[]>`
        select * from most_likely.rounds where id = ${auth.room.current_round_id}::uuid limit 1
      `;
      const round = rounds[0];
      if (!round) return fail(409, "This round is no longer active.");
      const votes = await sql<Row[]>`
        select target_player_id, voter_id from most_likely.votes where round_id = ${round.id}::uuid
      `;
      const eligibleIds = Array.isArray(round.eligible_player_ids) ? round.eligible_player_ids.map(String) : [];
      const missing = Math.max(0, eligibleIds.length - votes.length);
      if (missing > 0 && body.force !== true) {
        return fail(409, `${missing} player${missing === 1 ? " hasn't" : "s haven't"} voted yet.`, "MISSING_VOTES", { missing });
      }
      const players = await sql<Row[]>`
        select id, name, color from most_likely.players
         where room_id = ${auth.room.id}::uuid and id = any(${sql.array(eligibleIds)}::uuid[])
      `;
      const result = calculateRoundResult(players, votes);
      const revealedAt = new Date().toISOString();
      await sql.begin(async (tx) => {
        await tx`
          update most_likely.rounds
             set phase = 'results', result = ${tx.json(result)}, revealed_at = ${revealedAt}::timestamptz
           where id = ${round.id}::uuid and phase = 'voting'
        `;
        await tx`
          update most_likely.rooms
             set phase = 'results', last_activity_at = now(), expires_at = now() + interval '6 hours'
           where id = ${auth.room.id}::uuid
        `;
      });
      await broadcast(code);
      return ok({ revealed: true });
    }

    if (op === "next" || op === "skip") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can move the game forward.");
      if (op === "next" && auth.room.phase !== "results") return fail(409, "Reveal this round before starting the next one.");
      if (op === "skip" && auth.room.phase !== "voting") return fail(409, "Only an active question can be skipped.");
      if (op === "skip" && auth.room.current_round_id) {
        await sql`
          update most_likely.rounds set phase = 'skipped'
           where id = ${auth.room.current_round_id}::uuid and room_id = ${auth.room.id}::uuid
        `;
      }
      const players = await sql<Row[]>`
        select * from most_likely.players
         where room_id = ${auth.room.id}::uuid and kicked = false order by join_order
      `;
      const refreshed = await getRoom(code);
      if (!refreshed) return fail(404, "That room has expired.", "ROOM_NOT_FOUND");
      await createRound(refreshed, Number(auth.room.round_number ?? 0) + 1, players);
      await touchRoom(auth.room.id);
      await broadcast(code);
      return ok({ advanced: true });
    }

    if (op === "end") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can end the game.");
      const players = await sql<Row[]>`
        select id, name, color from most_likely.players
         where room_id = ${auth.room.id}::uuid and kicked = false
      `;
      const rounds = await sql<Row[]>`
        select question_text, award_category, result from most_likely.rounds
         where room_id = ${auth.room.id}::uuid and phase = 'results' and result is not null
         order by round_number
      `;
      const finalResults = calculateFinalResults(players, rounds);
      await sql`
        update most_likely.rooms
           set status = 'finished', phase = 'final_results', final_results = ${sql.json(finalResults)},
               last_activity_at = now(), expires_at = now() + interval '6 hours'
         where id = ${auth.room.id}::uuid
      `;
      await broadcast(code);
      return ok({ ended: true });
    }

    if (op === "play_again") {
      const auth = await requireHost(code, rawToken);
      if (!auth) return fail(403, "Only the host can restart the room.");
      if (auth.room.status !== "finished") return fail(409, "Finish the current game first.");
      await sql.begin(async (tx) => {
        await tx`
          update most_likely.rooms
             set status = 'lobby', phase = 'lobby', round_number = 0,
                 current_round_id = null, question_history = '{}'::text[], final_results = null,
                 last_activity_at = now(), expires_at = now() + interval '6 hours'
           where id = ${auth.room.id}::uuid
        `;
        await tx`delete from most_likely.rounds where room_id = ${auth.room.id}::uuid`;
      });
      await broadcast(code);
      return ok({ restarted: true });
    }

    return fail(400, "Unknown game action.");
  } catch (error) {
    console.error("most_likely-game-api", {
      op,
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error)
    });
    return fail(500, "Something went wrong. Please try again.");
  }
});
