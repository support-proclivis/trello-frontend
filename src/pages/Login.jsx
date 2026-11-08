import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, getToken, setToken } from "../api";

function safeNextPath(next) {
  if (!next?.startsWith("/") || next.includes("\\") || /%5c/i.test(next)) return "/";
  const destination = new URL(next, window.location.origin);
  if (destination.origin !== window.location.origin) return "/";
  const allowedPath = destination.pathname === "/"
    || destination.pathname === "/profile"
    || /^\/board\/\d+$/.test(destination.pathname)
    || /^\/workspaces\/\d+\/members$/.test(destination.pathname);
  return allowedPath ? `${destination.pathname}${destination.search}${destination.hash}` : "/";
}

export default function Login() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken()) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.access_token);
      nav(safeNextPath(searchParams.get("next")), { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><div className="logo">B</div> Boardly</div>
        <h1>Welcome back</h1>
        <p>Sign in to your workspaces and boards.</p>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Email / Username</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button className="btn" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Signing in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
