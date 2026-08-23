"use client";

import { useActionState } from "react";
import { signIn, signUp } from "@/lib/actions";
import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const action = mode === "in" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, null as { error?: string } | null);

  return (
    <main style={{ maxWidth: 340, margin: "16vh auto", padding: "0 20px" }}>
      <div className="brand" style={{ fontSize: 19 }}>Inspyr</div>
      <div className="brand-sub" style={{ marginBottom: 26 }}>Know what to say next</div>

      <form action={formAction} className="form-narrow">
        {state?.error && <div className="error">{state.error}</div>}
        {mode === "up" && (
          <label>
            <span className="label-text">Name</span>
            <input name="name" autoComplete="name" />
          </label>
        )}
        <label>
          <span className="label-text">Email</span>
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          <span className="label-text">Password</span>
          <input name="password" type="password" required minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </label>
        <button type="submit" data-variant="primary" disabled={pending} style={{ width: "100%" }}>
          {pending ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "in" ? "up" : "in")}
        style={{ border: "none", background: "none", padding: "14px 0", fontSize: 12.5, color: "var(--ink-3)" }}
      >
        {mode === "in" ? "Need an account?" : "Already have an account?"}
      </button>
    </main>
  );
}
