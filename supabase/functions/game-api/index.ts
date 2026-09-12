import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { calculateFinalResults, calculateRoundResult, selectQuestion } from "./game.ts";
import type { Pack } from "./questions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const COLORS = ["#c4b5fd", "#fda4af", "#86efac", "#fde68a", "#93c5fd", "#f0abfc", "#67e8f9", "#fdba74", "#a7f3d0", "#f9a8d4"];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8"
};

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: CORS });
}
function ok(data: unknown) { return response(200, { ok: true, data }); }
function fail(status: number, error: string, code?: string, details?: unknown) { return response(status, { ok: false, error, code, details }); }
function cleanCode(value: unknown) { return String(value ?? "").replace(/\D/g, "").slice(0, 4); }
function cleanName(value: unknown) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 24); }
function normalizeQuestion(value: unknown) {
  const text = String(value ?? "").trim().replace(/^who\s+(would|is\s+most\s+likely\s+to)\s*/i, "").replace(/^\.\.\./, "").replace(/^to\s+/i, "").replace(/\?+$/, "").trim().slice(0, 150);
  return text ? `${text}?` : "";
}
async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function roomCode() { return String(1000 + Math.floor(Math.random() * 9000)); }
async function broadcast(code: string) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast/${encodeURIComponent(`room:${code}`)}/events/state_changed`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ code, at: Date.now() })
    });
  } catch { /* polling is the realtime fallback */ }
}
async function touchRoom(roomId: string) {
  await db.from("rooms").update({ last_activity_at: new Date().toISOString(), expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() }).eq("id", roomId);
}
async function pruneExpired() { await db.from("rooms").delete().lt("expires_at", new Date().toISOString()); }

async function getRoom(code: string) {
  const { data, error } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}
async function authenticate(code: string, rawToken: string) {
  const room = await getRoom(code);
  if (!room) return null;
  const digest = await hashToken(rawToken);
  const { data: player } = await db.from("players").select("*").eq("room_id", room.id).eq("session_token_hash", digest).eq("kicked", false).maybeSingle();
  if (!player) return null;
  return { room, player };
}
async function requireHost(code: string, rawToken: string) {
  const auth = await authenticate(code, rawToken);
  if (!auth || !auth.player.is_host || auth.room.host_player_id !== auth.player.id) return null;
  return auth;
}

async function createRound(room: any, roundNumber: number, players: any[]) {
  const history = Array.isArray(room.question_history) ? room.question_history : [];
  const { data: recentRounds } = await db.from("rounds").select("topic").eq("room_id", room.id).order("round_number", { ascending: false }).limit(3);
  const q = selectQuestion({ pack: room.pack as Pack, usedIds: history, recentTopics: (recentRounds ?? []).map((r) => r.topic), customQuestions: room.custom_questions ?? [] });
  if (!q) throw new Error("No unused questions remain in this room.");
  const eligible = players.filter((p) => !p.kicked).map((p) => p.id);
  const { data: round, error } = await db.from("rounds").insert({
    room_id: room.id, question_id: q.id, question_text: q.text, question_pack: q.pack, award_category: q.awardCategory,
    tone: q.tone, topic: q.topic, allow_self: q.allowSelf, round_number: roundNumber, phase: "voting", eligible_player_ids: eligible
  }).select("*").single();
  if (error) throw error;
  await db.from("rooms").update({ status: "active", phase: "voting", round_number: roundNumber, current_round_id: round.id, question_history: [...history, q.id] }).eq("id", room.id);
  return round;
}

async function buildState(room: any, me: any) {
  const { data: players } = await db.from("players").select("id,name,color,initial,is_host,join_order,last_seen_at,kicked").eq("room_id", room.id).eq("kicked", false).order("join_order");
  const playerRows = players ?? [];
  const publicPlayers = playerRows.map((p) => ({ id: p.id, name: p.name, color: p.color, initial: p.initial, isHost: p.is_host, joinOrder: p.join_order, connected: Date.now() - new Date(p.last_seen_at).getTime() < 90000 }));
  let roundOut = null; let voting = null;
  if (room.current_round_id) {
    const { data: round } = await db.from("rounds").select("*").eq("id", room.current_round_id).maybeSingle();
    if (round) {
      const { data: votes } = await db.from("votes").select("voter_id").eq("round_id", round.id);
      const voterIds = new Set((votes ?? []).map((v) => v.voter_id));
      const eligibleIds = round.eligible_player_ids ?? [];
      voting = {
        voted: voterIds.size,
        eligible: eligibleIds.length,
        hasVoted: voterIds.has(me.id),
        ...(me.is_host ? { pendingNames: publicPlayers.filter((p) => eligibleIds.includes(p.id) && !voterIds.has(p.id)).map((p) => p.name) } : {})
      };
      roundOut = {
        id: round.id, roundNumber: round.round_number, questionId: round.question_id, questionText: round.question_text,
        awardCategory: round.award_category, tone: round.tone, allowSelf: round.allow_self, phase: round.phase,
        eligiblePlayerIds: eligibleIds, result: round.result, revealedAt: round.revealed_at
      };
    }
  }
  return {
    room: { code: room.code, status: room.status, phase: room.phase, pack: room.pack, roundNumber: room.round_number, customQuestions: room.custom_questions ?? [], createdAt: room.created_at },
    me: publicPlayers.find((p) => p.id === me.id) ?? { id: me.id, name: me.name, color: me.color, initial: me.initial, isHost: me.is_host, connected: true, joinOrder: me.join_order },
    players: publicPlayers,
    round: roundOut,
    voting,
    final: room.final_results,
    serverTime: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Method not allowed.");
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "Game backend is not configured.");
  let body: any;
  try { body = await req.json(); } catch { return fail(400, "Invalid request."); }
  const op = String(body.op ?? "");

  try {
    if (op === "create") {
      const name = cleanName(body.name);
      if (name.length < 2) return fail(400, "Please enter a name with at least 2 characters.");
      await pruneExpired();
      let code = "";
      for (let i = 0; i < 20; i++) { const candidate = roomCode(); const { data } = await db.from("rooms").select("id").eq("code", candidate).maybeSingle(); if (!data) { code = candidate; break; } }
      if (!code) return fail(503, "Could not create a room code. Try again.");
      const { data: room, error: roomError } = await db.from("rooms").insert({ code, pack: "mixed" }).select("*").single();
      if (roomError) throw roomError;
      const raw = token(); const digest = await hashToken(raw);
      const { data: player, error: playerError } = await db.from("players").insert({ room_id: room.id, name, name_key: name.toLowerCase(), color: COLORS[0], initial: name[0].toUpperCase(), session_token_hash: digest, is_host: true, join_order: 1 }).select("*").single();
      if (playerError) throw playerError;
      await db.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);
      return ok({ code, playerId: player.id, token: raw, name });
    }

    if (op === "join") {
      const code = cleanCode(body.code); const name = cleanName(body.name);
      if (code.length !== 4 || name.length < 2) return fail(400, "Enter a valid room code and name.");
      const room = await getRoom(code);
      if (!room) return fail(404, "That room does not exist or has expired.", "ROOM_NOT_FOUND");
      if (room.status !== "lobby") return fail(409, "That game has already started.", "ROOM_STARTED");
      const { data: existing } = await db.from("players").select("id").eq("room_id", room.id).eq("name_key", name.toLowerCase()).eq("kicked", false).maybeSingle();
      if (existing) return fail(409, "Someone in this room is already using that name.", "DUPLICATE_NAME");
      const { data: activePlayers } = await db.from("players").select("id,join_order").eq("room_id", room.id).eq("kicked", false);
      if ((activePlayers?.length ?? 0) >= 10) return fail(409, "This room is full.", "ROOM_FULL");
      const usedSlots = new Set((activePlayers ?? []).map((p) => p.join_order));
      const joinOrder = Array.from({ length: 10 }, (_, i) => i + 1).find((slot) => !usedSlots.has(slot));
      if (!joinOrder) return fail(409, "This room is full.", "ROOM_FULL");
      const raw = token(); const digest = await hashToken(raw);
      const { data: player, error } = await db.from("players").insert({ room_id: room.id, name, name_key: name.toLowerCase(), color: COLORS[(joinOrder - 1) % COLORS.length], initial: name[0].toUpperCase(), session_token_hash: digest, join_order: joinOrder }).select("*").single();
      if (error?.code === "23505") return fail(409, "That name or player slot was just taken. Try again.", "JOIN_CONFLICT");
      if (error) throw error;
      await touchRoom(room.id); await broadcast(code);
      return ok({ code, playerId: player.id, token: raw, name });
    }

    const code = cleanCode(body.code); const rawToken = String(body.token ?? "");
    if (code.length !== 4 || !rawToken) return fail(401, "Your room session is missing. Rejoin the room.");

    if (op === "state" || op === "heartbeat") {
      const auth = await authenticate(code, rawToken);
      if (!auth) return fail(401, "This room session is no longer valid. Rejoin the room.", "INVALID_SESSION");
      await db.from("players").update({ last_seen_at: new Date().toISOString() }).eq("id", auth.player.id);
      if (op === "heartbeat") return ok({ alive: true });
      const refreshedRoom = await getRoom(code);
      return ok(await buildState(refreshedRoom, { ...auth.player, last_seen_at: new Date().toISOString() }));
    }

    if (op === "configure") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can change room settings.");
      if (auth.room.status !== "lobby") return fail(409, "Game settings are locked after the game starts.");
      const pack = ["chill","chaos","savage","wholesome","mixed"].includes(body.pack) ? body.pack : "mixed";
      const custom = Array.isArray(body.customQuestions) ? body.customQuestions.slice(0, 15).map((q: any, i: number) => ({ id: `custom_${i + 1}_${crypto.randomUUID().slice(0,8)}`, text: normalizeQuestion(q.text), tone: ["funny","chaos","wholesome","savage"].includes(q.tone) ? q.tone : "funny" })).filter((q: any) => q.text.length >= 8) : [];
      await db.from("rooms").update({ pack, custom_questions: custom }).eq("id", auth.room.id); await touchRoom(auth.room.id); await broadcast(code);
      return ok({ saved: true });
    }

    if (op === "kick") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can remove players.");
      if (auth.room.status !== "lobby") return fail(409, "Players can only be removed before the game starts.");
      const target = String(body.playerId ?? ""); if (!target || target === auth.player.id) return fail(400, "That player cannot be removed.");
      await db.from("players").update({ kicked: true }).eq("id", target).eq("room_id", auth.room.id).eq("is_host", false); await broadcast(code); return ok({ removed: true });
    }

    if (op === "start") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can start the game.");
      if (auth.room.status !== "lobby") return fail(409, "This game has already started.");
      const { data: players } = await db.from("players").select("*").eq("room_id", auth.room.id).eq("kicked", false).order("join_order");
      if ((players?.length ?? 0) < 3) return fail(409, "You need at least 3 players to start.");
      await createRound(auth.room, 1, players ?? []); await touchRoom(auth.room.id); await broadcast(code); return ok({ started: true });
    }

    if (op === "vote") {
      const auth = await authenticate(code, rawToken); if (!auth) return fail(401, "Your room session is no longer valid.");
      if (auth.room.status !== "active" || auth.room.phase !== "voting" || !auth.room.current_round_id) return fail(409, "Voting is not open right now.");
      const { data: round } = await db.from("rounds").select("*").eq("id", auth.room.current_round_id).single();
      if (!round.eligible_player_ids.includes(auth.player.id)) return fail(403, "You are not eligible to vote in this round.");
      const target = String(body.targetPlayerId ?? "");
      if (!round.eligible_player_ids.includes(target)) return fail(400, "Choose a player in this room.");
      if (!round.allow_self && target === auth.player.id) return fail(400, "You cannot vote for yourself this round.");
      const { error } = await db.from("votes").insert({ round_id: round.id, voter_id: auth.player.id, target_player_id: target });
      if (error?.code === "23505") return fail(409, "Your vote is already locked.", "VOTE_LOCKED");
      if (error) throw error;
      await touchRoom(auth.room.id); await broadcast(code); return ok({ locked: true });
    }

    if (op === "reveal") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can reveal votes.");
      if (auth.room.phase !== "voting" || !auth.room.current_round_id) return fail(409, "There is nothing to reveal right now.");
      const { data: round } = await db.from("rounds").select("*").eq("id", auth.room.current_round_id).single();
      const { data: votes } = await db.from("votes").select("target_player_id,voter_id").eq("round_id", round.id);
      const missing = Math.max(0, round.eligible_player_ids.length - (votes?.length ?? 0));
      if (missing > 0 && body.force !== true) return fail(409, `${missing} player${missing === 1 ? " hasn't" : "s haven't"} voted yet.`, "MISSING_VOTES", { missing });
      const { data: players } = await db.from("players").select("id,name,color").eq("room_id", auth.room.id).in("id", round.eligible_player_ids);
      const result = calculateRoundResult(players ?? [], votes ?? []); const revealedAt = new Date().toISOString();
      await db.from("rounds").update({ phase: "results", result, revealed_at: revealedAt }).eq("id", round.id);
      await db.from("rooms").update({ phase: "results" }).eq("id", auth.room.id); await touchRoom(auth.room.id); await broadcast(code); return ok({ revealed: true });
    }

    if (op === "next" || op === "skip") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can move the game forward.");
      if (op === "next" && auth.room.phase !== "results") return fail(409, "Reveal this round before starting the next one.");
      if (op === "skip" && auth.room.phase !== "voting") return fail(409, "Only an active question can be skipped.");
      if (op === "skip" && auth.room.current_round_id) await db.from("rounds").update({ phase: "skipped" }).eq("id", auth.room.current_round_id);
      const { data: players } = await db.from("players").select("*").eq("room_id", auth.room.id).eq("kicked", false).order("join_order");
      const refreshed = await getRoom(code); await createRound(refreshed, (auth.room.round_number ?? 0) + 1, players ?? []); await touchRoom(auth.room.id); await broadcast(code); return ok({ advanced: true });
    }

    if (op === "end") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can end the game.");
      const { data: players } = await db.from("players").select("id,name,color").eq("room_id", auth.room.id).eq("kicked", false);
      const { data: rounds } = await db.from("rounds").select("question_text,award_category,result").eq("room_id", auth.room.id).eq("phase", "results").order("round_number");
      const finalResults = calculateFinalResults(players ?? [], (rounds ?? []).filter((r) => r.result));
      await db.from("rooms").update({ status: "finished", phase: "final_results", final_results: finalResults }).eq("id", auth.room.id); await touchRoom(auth.room.id); await broadcast(code); return ok({ ended: true });
    }

    if (op === "play_again") {
      const auth = await requireHost(code, rawToken); if (!auth) return fail(403, "Only the host can restart the room.");
      if (auth.room.status !== "finished") return fail(409, "Finish the current game first.");
      await db.from("rounds").delete().eq("room_id", auth.room.id);
      await db.from("rooms").update({ status: "lobby", phase: "lobby", round_number: 0, current_round_id: null, question_history: [], final_results: null }).eq("id", auth.room.id); await touchRoom(auth.room.id); await broadcast(code); return ok({ restarted: true });
    }

    return fail(400, "Unknown game action.");
  } catch (error) {
    console.error("game-api", op, error);
    return fail(500, "Something went wrong. Please try again.");
  }
});
