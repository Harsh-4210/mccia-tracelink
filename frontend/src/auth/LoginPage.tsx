import { FormEvent, useState } from "react";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { login, loginWithGoogle, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") setError("No account with that email");
      else if (code === "auth/wrong-password") setError("Incorrect password");
      else if (code === "auth/invalid-credential") setError("Invalid email or password");
      else if (code === "auth/email-already-in-use") setError("Email already registered");
      else if (code === "auth/weak-password") setError("Password must be at least 6 characters");
      else setError(err?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        setError(err?.message || "Google sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="d1-root">
      <div className="d1-scan" />
      <div className="d1-login-wrap">
        <div className="d1-login-card d1-frame">
          <div className="d1-login-badge">[ TRACELINK // AUTH ]</div>
          <h1 className="d1-login-title">
            {mode === "register" ? "Register" : "Authenticate"}
          </h1>
          <p className="d1-login-sub">
            Manufacturing traceability control system.
            <br />
            {mode === "register"
              ? "Create a new account to access the operations console."
              : "Enter your credentials to access the operations console."}
          </p>

          <form className="d1-login-form" onSubmit={handleSubmit}>
            <label>
              <span>EMAIL</span>
              <input
                className="d1-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                autoFocus
              />
            </label>
            <label>
              <span>PASSWORD</span>
              <input
                className="d1-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={6}
              />
            </label>
            {error && <div className="d1-error">! {error}</div>}
            <button className="d1-btn amber" type="submit" disabled={loading}>
              {loading
                ? "▶▶ PROCESSING…"
                : mode === "register"
                ? "▶ CREATE ACCOUNT"
                : "▶ LOGIN"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
            <span style={{ flex: 1, borderTop: "1px dashed var(--line-strong)" }} />
            <span style={{ fontSize: 10, letterSpacing: "0.18em", color: "var(--ink-dim)", textTransform: "uppercase" }}>or</span>
            <span style={{ flex: 1, borderTop: "1px dashed var(--line-strong)" }} />
          </div>

          <button
            className="d1-btn"
            onClick={handleGoogle}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            SIGN IN WITH GOOGLE
          </button>

          <button
            className="d1-btn"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            style={{ background: "transparent", color: "var(--ink-mid)", border: "1px dashed var(--line-strong)", fontSize: 11 }}
          >
            {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
          </button>

          <div className="d1-login-footer">
            TRACELINK v1.0 · FIREBASE AUTH · {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
}
