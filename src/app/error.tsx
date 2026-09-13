"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("WHO WOULD? route error", error);
  }, [error]);

  return (
    <main className="shell center-page">
      <section className="state-page card card-pad stack-lg">
        <div className="state-icon" aria-hidden="true">!</div>
        <div className="stack">
          <div className="eyebrow">Something went wrong</div>
          <h1 className="lobby-title">The room glitched.</h1>
          <p className="muted" style={{ margin: 0 }}>Your session may still be fine. Try the screen again before starting over.</p>
        </div>
        <div className="row wrap">
          <button className="btn btn-primary grow" onClick={reset}>Try again</button>
          <button className="btn btn-ghost grow" onClick={() => router.push("/")}>Go home</button>
        </div>
      </section>
    </main>
  );
}
