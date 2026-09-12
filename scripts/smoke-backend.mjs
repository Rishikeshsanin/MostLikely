const endpoint = process.env.BACKEND_SMOKE_URL;
if (!endpoint) throw new Error("BACKEND_SMOKE_URL is required");

async function api(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(`${payload.op} failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json.data;
}

const host = await api({ op: "create", name: "CI Host" });
const code = host.code;
console.log(`SMOKE_ROOM_CODE=${code}`);

const p2 = await api({ op: "join", code, name: "CI Player Two" });
const p3 = await api({ op: "join", code, name: "CI Player Three" });

let state = await api({ op: "state", code, token: host.token });
if (state.room.status !== "lobby" || state.players.length !== 3) {
  throw new Error(`Lobby sync mismatch: ${JSON.stringify({ status: state.room.status, players: state.players.length })}`);
}

await api({ op: "start", code, token: host.token });
state = await api({ op: "state", code, token: host.token });
if (state.room.phase !== "voting" || !state.round || state.round.roundNumber !== 1) {
  throw new Error("Round 1 did not start correctly");
}

const hostId = host.playerId;
const p2Id = p2.playerId;
const p3Id = p3.playerId;
await Promise.all([
  api({ op: "vote", code, token: host.token, targetPlayerId: p2Id }),
  api({ op: "vote", code, token: p2.token, targetPlayerId: p3Id }),
  api({ op: "vote", code, token: p3.token, targetPlayerId: p2Id })
]);

state = await api({ op: "state", code, token: host.token });
if (state.voting?.voted !== 3 || state.round?.result != null) {
  throw new Error("Secret-vote state is incorrect before reveal");
}

await api({ op: "reveal", code, token: host.token });
state = await api({ op: "state", code, token: host.token });
const p2Result = state.round?.result?.entries?.find((entry) => entry.playerId === p2Id);
if (state.room.phase !== "results" || p2Result?.votes !== 2 || state.round?.result?.totalVotes !== 3) {
  throw new Error(`Reveal mismatch: ${JSON.stringify(state.round?.result)}`);
}

await api({ op: "end", code, token: host.token });
state = await api({ op: "state", code, token: host.token });
if (state.room.status !== "finished" || state.room.phase !== "final_results" || state.final?.questionCount !== 1) {
  throw new Error("Final results were not produced correctly");
}

// Confirm a non-host cannot mutate Host-only state.
const forbidden = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ op: "play_again", code, token: p2.token })
});
if (forbidden.status !== 403) {
  throw new Error(`Host authorization regression: expected 403, got ${forbidden.status}`);
}

console.log(`SMOKE_OK room=${code} host=${hostId} winner=${p2Id}`);
