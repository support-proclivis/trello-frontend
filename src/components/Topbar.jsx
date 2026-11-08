import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { getThemePreference, setThemePreference } from "../theme.js";

export default function Topbar({ user, extra }) {
  const nav = useNavigate();
  const [theme, setTheme] = useState(getThemePreference);

  function changeTheme(event) {
    const selectedTheme = event.target.value;
    setTheme(selectedTheme);
    setThemePreference(selectedTheme);
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    setToken(null);
    nav("/login", { replace: true });
  }
  const initials = ((user?.first_name?.[0] || user?.username?.[0] || "U") + (user?.last_name?.[0] || "")).toUpperCase();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <div className="logo">B</div>
        Boardly
      </Link>
      <div className="top-actions">
        {extra}
        <select
          className="search theme-select"
          aria-label="Color theme"
          title="Color theme"
          value={theme}
          onChange={changeTheme}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <Link className="nav-link" to="/">Boards</Link>
        <Link className="nav-link" to="/profile">{user?.first_name || user?.username}</Link>
        <div className="avatar" title={user?.email}>{initials}</div>
        <button className="btn ghost small" onClick={logout}>Logout</button>
      </div>
    </header>
  );
}
