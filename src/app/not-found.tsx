import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell center-page">
      <section className="state-page card card-pad stack-lg">
        <div className="state-icon" aria-hidden="true">404</div>
        <div className="stack">
          <div className="eyebrow">Wrong room</div>
          <h1 className="lobby-title">Nothing to vote on here.</h1>
          <p className="muted" style={{ margin: 0 }}>The link may be old, mistyped, or the room may have already expired.</p>
        </div>
        <Link className="btn btn-primary btn-full" href="/">Back to WHO WOULD?</Link>
      </section>
    </main>
  );
}
