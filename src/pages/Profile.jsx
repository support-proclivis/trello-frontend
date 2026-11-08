import { useState } from "react";
import { api } from "../api";
import Topbar from "../components/Topbar.jsx";

export default function Profile({ user, setUser }) {
  const [form, setForm] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    mobile: user?.mobile || "",
    department: user?.department || "",
    designation: user?.designation || "",
    timezone: user?.timezone || "UTC",
    language: user?.language || "en",
  });
  const [msg, setMsg] = useState("");

  async function save(e) {
    e.preventDefault();
    const updated = await api("/api/auth/profile", { method: "PUT", body: JSON.stringify(form) });
    setUser(updated);
    setMsg("Profile saved");
  }

  return (
    <div className="app-shell">
      <Topbar user={user} />
      <div className="page">
        <div className="panel" style={{ maxWidth: 560 }}>
          <h1>Profile</h1>
          <p className="muted">{user?.email}</p>
          {msg && <div className="hint">{msg}</div>}
          <form onSubmit={save}>
            {["first_name", "last_name", "mobile", "department", "designation", "timezone", "language"].map((k) => (
              <div className="field" key={k}>
                <label>{k.replace("_", " ")}</label>
                <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <button className="btn">Save</button>
          </form>
        </div>
      </div>
    </div>
  );
}
