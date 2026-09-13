"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/api";
import { saveSession } from "@/lib/session";

export function HomeClient() {
  const router = useRouter();
  const [mode, setMode] = useState<"home" | "create" | "join">("home");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await createRoom(name.trim());
      saveSession({ ...session, code: session.code });
      router.push(`/room/${session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the room.");
    } finally { setBusy(false); }
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await joinRoom(code.trim(), name.trim());
      saveSession({ ...session, code: session.code });
      router.push(`/room/${session.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join the room.");
    } finally { setBusy(false); }
  }

  return (
    <main className="shell center-page home-shell">
      <div className="home-stage stack-lg">
        <section className="home-hero">
          <div className="row-between hero-topline">
            <div className="row">
              <div className="brand-mark brand-mark-lg" aria-hidden="true">W?</div>
              <div><div className="eyebrow">Party game</div><div className="muted small">3–10 friends · one room</div></div>
            </div>
            <div className="live-badge"><span className="dot dot-live" /> LIVE MULTIPLAYER</div>
          </div>

          <div className="stack hero-copy-block">
            <h1 className="hero-title">WHO <span className="would">WOULD?</span></h1>
            <p className="hero-copy">Your friends vote. <strong>The room decides.</strong></p>
            <p className="muted hero-subcopy">No accounts. No explanations. Just secret votes, dramatic reveals, and a suspicious amount of evidence.</p>
          </div>

          <div className="hero-meta" aria-label="Game highlights">
            <span className="meta-chip">⚡ Realtime sync</span>
            <span className="meta-chip">🎭 255+ questions</span>
            <span className="meta-chip">🔒 Secret voting</span>
          </div>
        </section>

        {mode === "home" && (
          <div className="stack-lg home-entry">
            <div className="question-teaser card-soft" aria-hidden="true">
              <div className="teaser-copy">
                <span className="teaser-kicker">QUESTION PREVIEW</span>
                <strong>Who would survive a zombie apocalypse?</strong>
              </div>
              <div className="teaser-avatars">
                <span style={{ background: "#c4b5fd" }}>R</span>
                <span style={{ background: "#fda4af" }}>A</span>
                <span style={{ background: "#86efac" }}>K</span>
                <span className="teaser-more">+3</span>
              </div>
            </div>

            <div className="home-actions">
              <button className="btn btn-primary btn-feature" onClick={() => { setMode("create"); setError(""); }}>
                <span>Create room</span><small>Start the chaos →</small>
              </button>
              <button className="btn btn-secondary btn-feature" onClick={() => { setMode("join"); setError(""); }}>
                <span>Join room</span><small>I have a code</small>
              </button>
            </div>

            <div className="how-grid" aria-label="How to play">
              <div className="card-soft how-step"><span className="how-num">1</span><div><strong>Join the room</strong><span>Code or QR. No signup.</span></div></div>
              <div className="card-soft how-step"><span className="how-num">2</span><div><strong>Vote secretly</strong><span>Pick anyone — even yourself.</span></div></div>
              <div className="card-soft how-step"><span className="how-num">3</span><div><strong>Reveal the damage</strong><span>See exactly what the room decided.</span></div></div>
            </div>
          </div>
        )}

        {mode === "create" && (
          <form className="card card-pad stack form-card" onSubmit={submitCreate}>
            <div className="row-between form-heading"><div><div className="eyebrow">Create room</div><h2>What should we call you?</h2><p className="muted small">You&apos;ll be the host. Friends can join in seconds.</p></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setMode("home")}>Back</button></div>
            <div className="field"><label htmlFor="create-name">Your name</label><input id="create-name" className="input" maxLength={24} autoFocus autoComplete="nickname" placeholder="Rishi" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || name.trim().length < 2}>{busy ? "Creating room…" : "Create room"}</button>
          </form>
        )}

        {mode === "join" && (
          <form className="card card-pad stack form-card" onSubmit={submitJoin}>
            <div className="row-between form-heading"><div><div className="eyebrow">Join room</div><h2>Enter the code</h2><p className="muted small">Four digits. One questionable group chat.</p></div><button className="btn btn-ghost btn-sm" type="button" onClick={() => setMode("home")}>Back</button></div>
            <div className="field"><label htmlFor="room-code">Room code</label><input id="room-code" className="input input-code" inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="5832" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0,4))} /></div>
            <div className="field"><label htmlFor="join-name">Your name</label><input id="join-name" className="input" maxLength={24} autoComplete="nickname" placeholder="Aryan" value={name} onChange={(e) => setName(e.target.value)} /></div>
            {error && <div className="error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || code.length !== 4 || name.trim().length < 2}>{busy ? "Joining room…" : "Join room"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
