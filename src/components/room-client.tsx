"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { configureRoom, getRoomState, roomAction } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { subscribeToRoom } from "@/lib/realtime";
import { tone, vibrate } from "@/lib/feedback";
import type { Pack, RoomState } from "@/lib/types";

const PACKS: Array<{ key: Pack; title: string; copy: string }> = [
  { key: "mixed", title: "Mixed", copy: "The best all-round party set." },
  { key: "chill", title: "Chill", copy: "Funny, easy, harmless." },
  { key: "chaos", title: "Chaos", copy: "Bad decisions. Great stories." },
  { key: "savage", title: "Savage", copy: "Roast-level honesty for close friends." },
  { key: "wholesome", title: "Wholesome", copy: "Trust, loyalty and good people." }
];

function specialCopy(special?: string) {
  if (special === "unanimous") return "THE GROUP HAS SPOKEN.";
  if (special === "tie") return "WE HAVE A TIE.";
  if (special === "landslide") return "NOT EVEN CLOSE.";
  if (special === "no_consensus") return "YOU PEOPLE AGREE ON NOTHING.";
  return "THE VOTES ARE IN.";
}

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [pack, setPack] = useState<Pack>("mixed");
  const [customQuestions, setCustomQuestions] = useState<RoomState["room"]["customQuestions"]>([]);
  const [customText, setCustomText] = useState("");
  const [customTone, setCustomTone] = useState<"funny" | "chaos" | "wholesome" | "savage">("funny");
  const [revealTick, setRevealTick] = useState(Date.now());
  const previousPhase = useRef<string | null>(null);
  const session = useMemo(() => loadSession(code), [code]);

  const refresh = useCallback(async (quiet = false) => {
    if (!session) { setLoading(false); return; }
    try {
      const next = await getRoomState(code, session.token);
      setState(next);
      setPack(next.room.pack);
      setCustomQuestions(next.room.customQuestions);
      setError("");
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Could not load this room.");
    } finally { setLoading(false); }
  }, [code, session]);

  useEffect(() => {
    void refresh();
    if (!session) return;
    const unsubscribe = subscribeToRoom(code, () => void refresh(true));
    const poll = window.setInterval(() => void refresh(true), 5000);
    const heartbeat = window.setInterval(() => void roomAction(code, session.token, "heartbeat").catch(() => undefined), 25000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { unsubscribe(); clearInterval(poll); clearInterval(heartbeat); document.removeEventListener("visibilitychange", onVisible); };
  }, [code, refresh, session]);

  useEffect(() => {
    if (!state) return;
    const phase = state.room.phase;
    if (phase === "results" && previousPhase.current !== "results") {
      setSelected(null);
      if (soundOn) tone(390, .09, .04);
      if (hapticsOn) vibrate([25, 35, 50]);
    }
    previousPhase.current = phase;
  }, [state, soundOn, hapticsOn]);

  useEffect(() => {
    if (!state?.round?.revealedAt || state.room.phase !== "results") return;
    setRevealTick(Date.now());
    const id = window.setInterval(() => setRevealTick(Date.now()), 120);
    return () => clearInterval(id);
  }, [state?.round?.revealedAt, state?.room.phase]);

  async function action(name: string, data: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(name); setError("");
    try {
      await roomAction(code, session.token, name, data);
      await refresh(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(""); }
  }

  async function saveConfig(nextPack = pack, nextCustom = customQuestions) {
    if (!session) return;
    setBusy("configure"); setError("");
    try { await configureRoom(code, session.token, nextPack, nextCustom); await refresh(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save settings."); }
    finally { setBusy(""); }
  }

  if (loading) return <main className="shell center-page"><div className="muted waiting" style={{ textAlign: "center" }}>Opening room {code}…</div></main>;
  if (!session) return <main className="shell center-page"><div className="card card-pad stack"><div className="eyebrow">Room {code}</div><h1 style={{ margin: 0 }}>This device hasn&apos;t joined yet.</h1><p className="muted">Enter your name to claim a player slot.</p><button className="btn btn-primary" onClick={() => router.replace(`/join/${code}`)}>Join this room</button><button className="btn btn-ghost" onClick={() => router.push("/")}>Home</button></div></main>;
  if (!state) return <main className="shell center-page"><div className="card card-pad stack"><h1 style={{ margin: 0 }}>Couldn&apos;t open the room.</h1>{error && <div className="error">{error}</div>}<button className="btn btn-primary" onClick={() => void refresh()}>Try again</button><button className="btn btn-ghost" onClick={() => router.push(`/join/${code}`)}>Rejoin</button></div></main>;

  const isHost = state.me.isHost;
  const myVoteLocked = Boolean(state.voting?.hasVoted);
  const eligiblePlayers = state.players.filter((p) => state.round?.eligiblePlayerIds.includes(p.id));
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  return (
    <main className={`shell ${state.room.phase === "lobby" ? "shell-wide" : ""}`}>
      <div className="topbar">
        <button className="row btn-ghost btn btn-sm" onClick={() => router.push("/")} aria-label="Go home"><span className="brand-mark" style={{ width: 31, height: 31, borderRadius: 10 }}>W?</span></button>
        <div className="pill"><span className="dot dot-live" /> ROOM <span className="room-code">{code}</span></div>
        <div className="settings-pop">
          <button className="btn btn-ghost btn-sm" aria-label="Settings" onClick={() => setSettingsOpen((v) => !v)}>•••</button>
          {settingsOpen && <div className="settings-menu">
            <div className="toggle-row"><span>Sound</span><button className="toggle" data-on={soundOn} onClick={() => setSoundOn((v) => !v)}><span /></button></div>
            <div className="toggle-row"><span>Haptics</span><button className="toggle" data-on={hapticsOn} onClick={() => setHapticsOn((v) => !v)}><span /></button></div>
          </div>}
        </div>
      </div>

      {error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}

      {state.room.phase === "lobby" && (
        <section className="stack-lg" style={{ marginTop: 22 }}>
          <div><div className="eyebrow">Lobby</div><h1 className="lobby-title">Waiting for the group.</h1><p className="muted">Scan, join, and start when everyone&apos;s in.</p></div>
          <div className="lobby-grid">
            <div className="stack-lg">
              <div className="card card-pad stack">
                <div className="row-between"><strong>{state.players.length} / 10 players</strong><span className="pill">Minimum 3</span></div>
                <div className="player-list">
                  {state.players.map((p) => <div className={`player-row ${!p.connected ? "offline" : ""}`} key={p.id}><div className="avatar" style={{ background: p.color }}>{p.initial}</div><div className="grow"><div className="player-name">{p.name} {p.isHost && <span className="crown">♛</span>}</div><div className="subtle micro">{p.connected ? (p.id === state.me.id ? "You" : "Ready") : "Reconnecting…"}</div></div>{isHost && !p.isHost && <button className="btn btn-ghost btn-sm" onClick={() => void action("kick", { playerId: p.id })}>Remove</button>}</div>)}
                </div>
              </div>
              {isHost && <div className="card card-pad stack">
                <div className="row-between"><div><div className="eyebrow">Question pack</div><strong>Pick the room&apos;s energy</strong></div><span className="pill">Mixed recommended</span></div>
                <div className="pack-grid">{PACKS.map((p) => <button key={p.key} className="pack-card" data-active={pack === p.key} onClick={() => { setPack(p.key); void saveConfig(p.key, customQuestions); }}><strong>{p.title}</strong><span className="muted small">{p.copy}</span></button>)}</div>
                <div className="field"><label>Optional custom question</label><div className="custom-row"><input className="input" maxLength={150} placeholder="Who would miss class for no reason?" value={customText} onChange={(e) => setCustomText(e.target.value)} /><select className="select" value={customTone} onChange={(e) => setCustomTone(e.target.value as typeof customTone)}><option value="funny">Funny</option><option value="chaos">Chaos</option><option value="wholesome">Wholesome</option><option value="savage">Savage</option></select><button className="btn btn-secondary" disabled={customText.trim().length < 6} onClick={() => { const next = [...customQuestions, { id: `draft_${Date.now()}`, text: customText.trim(), tone: customTone }]; setCustomQuestions(next); setCustomText(""); void saveConfig(pack, next); }}>Add</button></div></div>
                {customQuestions.length > 0 && <div className="stack">{customQuestions.map((q, i) => <div className="player-row" key={`${q.id}-${i}`}><div className="grow small">Who would… {q.text}</div><button className="btn btn-ghost btn-sm" onClick={() => { const next = customQuestions.filter((_, x) => x !== i); setCustomQuestions(next); void saveConfig(pack, next); }}>Remove</button></div>)}</div>}
              </div>}
            </div>
            <div className="stack-lg sticky-side">
              <div className="card card-pad stack"><div className="row-between"><div><div className="eyebrow">Quick join</div><strong>Scan this QR</strong></div><div className="qr-wrap"><QRCodeSVG value={joinUrl} size={112} fgColor="#09090b" bgColor="#ffffff" level="M" /></div></div><div className="notice">Or open <strong>/join/{code}</strong></div></div>
              {isHost ? <button className="btn btn-primary btn-full" style={{ minHeight: 62 }} disabled={busy === "start" || state.players.length < 3} onClick={() => void action("start")}>{state.players.length < 3 ? `Need ${3 - state.players.length} more player${3 - state.players.length === 1 ? "" : "s"}` : busy === "start" ? "Starting…" : "Start game"}</button> : <div className="card card-pad locked"><div className="waiting">Waiting for {state.players.find((p) => p.isHost)?.name ?? "the host"} to start…</div></div>}
            </div>
          </div>
        </section>
      )}

      {state.room.phase === "voting" && state.round && (
        <section className="game-shell" style={{ marginTop: 16 }}>
          <div className="row-between"><div className="round-kicker">Round {state.round.roundNumber}</div><div className="pill"><span className="voted-count">{state.voting?.voted ?? 0} / {state.voting?.eligible ?? 0}</span> voted</div></div>
          <div className="question-panel">
            <p className="question-prefix">WHO WOULD…</p><h1 className="question">{state.round.questionText}</h1>
            {!myVoteLocked ? <div className="vote-grid">{eligiblePlayers.map((p) => { const disabled = !state.round?.allowSelf && p.id === state.me.id; return <button key={p.id} className="vote-card" data-selected={selected === p.id} disabled={disabled || busy === "vote"} onClick={() => setSelected(p.id)}><div className="vote-avatar" style={{ background: p.color }}>{p.initial}</div><div className="vote-name">{p.name}{disabled ? <span className="subtle micro"> · you</span> : ""}</div></button>; })}</div> : <div className="locked"><div className="lock-check">✓</div><div><strong style={{ fontSize: "1.2rem" }}>VOTE LOCKED</strong><div className="muted" style={{ marginTop: 6 }}>Waiting for everyone…</div></div><div className="pill"><span className="voted-count">{state.voting?.voted} / {state.voting?.eligible}</span> voted</div></div>}
          </div>
          <div className="stack">
            {!myVoteLocked && <button className="btn btn-primary btn-full" disabled={!selected || busy === "vote"} onClick={async () => { if (!selected) return; await action("vote", { targetPlayerId: selected }); if (soundOn) tone(620); if (hapticsOn) vibrate(22); }}>{busy === "vote" ? "Locking…" : "Lock vote"}</button>}
            {isHost && <div className="row wrap">
              <button className="btn btn-good grow" disabled={(state.voting?.voted ?? 0) === 0 || busy === "reveal"} onClick={() => { const missing = (state.voting?.eligible ?? 0) - (state.voting?.voted ?? 0); if (missing > 0 && !window.confirm(`${missing} player${missing === 1 ? " hasn't" : "s haven't"} voted. Reveal anyway?`)) return; void action("reveal", { force: missing > 0 }); }}>{(state.voting?.voted ?? 0) === (state.voting?.eligible ?? -1) ? "Reveal votes" : "Reveal early"}</button>
              <button className="btn btn-ghost" onClick={() => { if (window.confirm("Skip this question? Any votes already cast will be discarded.")) void action("skip"); }}>Skip</button>
              <button className="btn btn-danger" onClick={() => { const message = state.room.roundNumber < 10 ? "Results get better after more questions. End the game anyway?" : "End the game and show final awards?"; if (window.confirm(message)) void action("end"); }}>End game</button>
            </div>}
            {isHost && (state.voting?.pendingNames?.length ?? 0) > 0 && <div className="subtle micro" style={{ textAlign: "center" }}>Still waiting on: {state.voting?.pendingNames?.join(", ")}</div>}
          </div>
        </section>
      )}

      {state.room.phase === "results" && state.round?.result && <Results state={state} tick={revealTick} isHost={isHost} busy={busy} onAction={action} />}
      {state.room.phase === "final_results" && state.final && <FinalResults state={state} busy={busy} onAction={action} />}
    </main>
  );
}

function Results({ state, tick, isHost, busy, onAction }: { state: RoomState; tick: number; isHost: boolean; busy: string; onAction: (name: string, data?: Record<string, unknown>) => Promise<void> }) {
  const round = state.round!; const result = round.result!;
  const elapsed = round.revealedAt ? tick - new Date(round.revealedAt).getTime() : 9999;
  const topNames = result.entries.filter((e) => result.winners.includes(e.playerId)).map((e) => e.name).join(" & ");
  if (elapsed < 3200) {
    let copy = "THE VOTES ARE IN.";
    if (elapsed >= 700 && elapsed < 1450) copy = `${result.totalVotes} VOTE${result.totalVotes === 1 ? "" : "S"} WERE CAST.`;
    else if (elapsed >= 1450 && elapsed < 2250) copy = `ONE PERSON RECEIVED… ${result.topVotes} VOTE${result.topVotes === 1 ? "" : "S"}.`;
    else if (elapsed >= 2250) copy = topNames || "NO CONSENSUS";
    return <section className="game-shell" style={{ marginTop: 16 }}><div className="round-kicker">Round {round.roundNumber} · reveal</div><div className="result-hero"><div className={`reveal-text ${elapsed >= 2250 ? "reveal-name" : ""}`} key={copy}>{copy}</div></div><div /></section>;
  }
  return <section className="stack-lg" style={{ marginTop: 22 }}><div className="stack"><div className="special-banner">{specialCopy(result.special)}</div><div className="eyebrow">Round {round.roundNumber}</div><h1 className="question" style={{ fontSize: "clamp(1.75rem,7vw,3.2rem)" }}>{round.questionText}</h1></div><div className="result-list">{result.entries.map((entry) => <div className="result-row" key={entry.playerId}><div className="result-bar" style={{ width: `${entry.percentage}%`, background: entry.color }} /><div className="avatar" style={{ width: 40, height: 40, background: entry.color }}>{entry.name[0]}</div><div><div className="player-name">{entry.name}</div><div className="subtle micro">{entry.percentage}% of votes</div></div><div className="result-votes">{entry.votes}</div></div>)}</div>{isHost ? <div className="row wrap"><button className="btn btn-primary grow" disabled={busy === "next"} onClick={() => void onAction("next")}>{busy === "next" ? "Loading…" : "Next question"}</button><button className="btn btn-danger" onClick={() => { if (window.confirm("End the game and show final awards?")) void onAction("end"); }}>End game</button></div> : <div className="notice" style={{ textAlign: "center" }}>Waiting for the host to move on…</div>}</section>;
}

function FinalResults({ state, busy, onAction }: { state: RoomState; busy: string; onAction: (name: string) => Promise<void> }) {
  const final = state.final!; const router = useRouter();
  async function share() {
    const text = `WHO WOULD? — ${final.questionCount} questions, ${final.totalVotes} votes. The group has spoken.`;
    try { if (navigator.share) await navigator.share({ title: "WHO WOULD? results", text, url: location.href }); else await navigator.clipboard.writeText(`${text} ${location.href}`); } catch { /* user cancelled */ }
  }
  return <section className="stack-lg" style={{ marginTop: 28 }}><div><div className="eyebrow">Final results</div><h1 className="lobby-title">THE GROUP HAS SPOKEN.</h1><p className="muted">{final.questionCount} questions · {final.totalVotes} secret votes · zero plausible deniability.</p></div>
    {final.categoryAwards.length > 0 && <div className="stack"><div className="eyebrow">Game awards</div>{final.categoryAwards.map((a) => <div className="card award-card" key={a.key}><div className="award-title">{a.title}</div><div><div className="award-name">{a.playerName}</div><div className="muted small" style={{ marginTop: 9 }}>{a.subtitle}</div></div></div>)}</div>}
    {final.sessionAwards.length > 0 && <div className="stack"><div className="eyebrow">Session awards</div>{final.sessionAwards.map((a) => <div className="card card-pad row-between" key={a.key}><div><div className="award-title">{a.title}</div><div className="player-name" style={{ fontSize: "1.35rem", marginTop: 4 }}>{a.playerName}</div></div><div className="pill">{a.score}</div></div>)}</div>}
    {final.topMoments.length > 0 && <div className="stack"><div className="eyebrow">Top moments</div>{final.topMoments.map((m) => <div className="card-soft card-pad" key={m.label}><div className="award-title">{m.label}</div><strong style={{ display: "block", marginTop: 8 }}>{m.question}</strong><div className="muted small" style={{ marginTop: 7 }}>{m.detail}</div></div>)}</div>}
    <div className="stack"><div className="eyebrow">The receipts</div>{final.receipts.map((r, i) => <div className="receipt" key={i}>{r}</div>)}</div>
    <div className="row wrap"><button className="btn btn-secondary grow" onClick={() => void share()}>Share results</button>{state.me.isHost && <button className="btn btn-primary grow" disabled={busy === "play_again"} onClick={() => void onAction("play_again")}>Play again</button>}<button className="btn btn-ghost" onClick={() => router.push("/")}>New room</button></div>
  </section>;
}
