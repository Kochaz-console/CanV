import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, BookOpenCheck, LoaderCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setMessage("");
    setBusy(true);

    try {
      if (mode === "signup") {
        const cleanUsername = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
          throw new Error("Username must be 3–20 characters: letters, numbers, or underscores.");
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: displayName.trim() || cleanUsername,
            },
          },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Check your email for a confirmation link, then come back to log in.");
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (loginError) throw loginError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="brand-lockup">
          <span className="brand-mark"><BookOpenCheck size={21} /></span>
          <span>study<span className="brand-accent">tracker</span></span>
        </div>
        <section className="auth-card">
          <div className="eyebrow"><span className="live-dot" /> YOUR STUDY SPACE</div>
          <h1>{mode === "signup" ? "Make progress." : "Good to see you."}</h1>
          <p className="auth-subtitle">
            {mode === "signup"
              ? "A little every day adds up. Start keeping track."
              : "Pick up where you left off."}
          </p>
          <div className="auth-switch" role="tablist" aria-label="Account options">
            <button
              className={mode === "signup" ? "active" : ""}
              onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
              role="tab"
              aria-selected={mode === "signup"}
              type="button"
            >
              Create account
            </button>
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              role="tab"
              aria-selected={mode === "login"}
              type="button"
            >
              Log in
            </button>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <>
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="e.g. alex_studies"
                    autoComplete="username"
                    minLength={3}
                    maxLength={20}
                    required
                  />
                  <span className="field-hint">3–20 letters, numbers, or underscores</span>
                </label>
                <label>
                  Display name
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="What should friends call you?"
                    autoComplete="name"
                    maxLength={40}
                    required
                  />
                </label>
              </>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}
            {message && <p className="form-message success-message" role="status">{message}</p>}
            <button className="button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {busy ? "Please wait…" : mode === "signup" ? "Create my account" : "Log in"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="auth-footnote">Your account is private; study summaries are shared with your group.</p>
        </section>
        <p className="auth-bottom">A more focused way to see how far you’ve come.</p>
      </div>
    </main>
  );
}
