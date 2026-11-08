import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getToken, setToken } from "../api";

export default function InviteAccept() {
  const { token } = useParams();
  const nav = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [form, setForm] = useState({ username: "", first_name: "", last_name: "", password: "" });
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const next = `/invite/${token}`;

  useEffect(() => {
    async function load() {
      try {
        const invite = await api(`/api/invitations/${token}`);
        setInvitation(invite);
        if (getToken()) {
          try {
            setCurrentUser(await api("/api/auth/me"));
          } catch {
            setCurrentUser(null);
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function createAccount(e) {
    e.preventDefault();
    setError("");
    try {
      const result = await api(`/api/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToken(result.access_token);
      nav("/", { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  async function acceptExisting() {
    setError("");
    try {
      await api(`/api/invitations/${token}/accept-existing`, { method: "POST" });
      nav("/", { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  function switchAccount() {
    setToken(null);
    nav(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  }

  if (loading) return <div className="page">Loading invitation...</div>;

  return (
    <div className="login-wrap">
      <section className="login-card">
        <div className="brand"><div className="logo">B</div> Boardly</div>
        {error && <div className="error" role="alert">{error}</div>}
        {!invitation ? (
          <>
            <h1>Invitation unavailable</h1>
            <p>This invitation may have expired or been revoked.</p>
            <Link className="btn" to="/login">Go to login</Link>
          </>
        ) : (
          <>
            <h1>Join {invitation.workspace_name}</h1>
            <p>You are invited as <strong>{invitation.role.replaceAll("_", " ")}</strong>.</p>
            <p className="muted">Invitation for {invitation.email}</p>
            {invitation.account_exists ? (
              currentUser?.email?.toLowerCase() === invitation.email.toLowerCase() ? (
                <button className="btn" style={{ width: "100%" }} onClick={acceptExisting}>Accept invitation</button>
              ) : currentUser ? (
                <>
                  <p>This invitation is for a different account. Switch to the invited email to accept it.</p>
                  <button className="btn" style={{ width: "100%" }} onClick={switchAccount}>Sign in as invitee</button>
                </>
              ) : (
                <>
                  <p>Sign in with the invited email address to accept.</p>
                  <Link className="btn" style={{ display: "block", textAlign: "center" }} to={`/login?next=${encodeURIComponent(next)}`}>Sign in to accept</Link>
                </>
              )
            ) : currentUser ? (
              <>
                <p>Sign out before creating an account for the invited email.</p>
                <button className="btn" style={{ width: "100%" }} onClick={switchAccount}>Continue as invitee</button>
              </>
            ) : (
              <form onSubmit={createAccount}>
                <div className="field">
                  <label htmlFor="invite-username">Username</label>
                  <input id="invite-username" required minLength="2" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
                </div>
                <div className="field">
                  <label htmlFor="invite-first-name">First name</label>
                  <input id="invite-first-name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} autoComplete="given-name" />
                </div>
                <div className="field">
                  <label htmlFor="invite-last-name">Last name</label>
                  <input id="invite-last-name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} autoComplete="family-name" />
                </div>
                <div className="field">
                  <label htmlFor="invite-password">Password (at least 8 characters)</label>
                  <input id="invite-password" type="password" required minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                </div>
                <button className="btn" style={{ width: "100%" }}>Create account &amp; join</button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
