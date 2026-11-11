import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api } from "../api";
import Topbar from "../components/Topbar.jsx";

export default function Dashboard({ user }) {
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [showWs, setShowWs] = useState(false);
  const [showBoard, setShowBoard] = useState(null);
  const [editingBoard, setEditingBoard] = useState(null);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [boardForm, setBoardForm] = useState({ name: "", description: "", background: "#0d7377" });
  const [error, setError] = useState("");

  async function load() {
    const [ws, us] = await Promise.all([api("/api/workspaces"), api("/api/users")]);
    setWorkspaces(ws);
    setUsers(us);
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function createWorkspace(e) {
    e.preventDefault();
    await api("/api/workspaces", { method: "POST", body: JSON.stringify(form) });
    setShowWs(false);
    setForm({ name: "", code: "", description: "" });
    load();
  }

  async function createBoard(e) {
    e.preventDefault();
    try {
      if (editingBoard) {
        await api(`/api/boards/${editingBoard.id}`, {
          method: "PUT",
          body: JSON.stringify(boardForm),
        });
        setEditingBoard(null);
        setBoardForm({ name: "", description: "", background: "#0d7377" });
        await load();
      } else {
        const b = await api("/api/boards", {
          method: "POST",
          body: JSON.stringify({ ...boardForm, workspace_id: showBoard }),
        });
        nav(`/board/${b.id}`);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  function editBoard(e, board) {
    e.stopPropagation();
    setEditingBoard(board);
    setShowBoard(null);
    setBoardForm({ name: board.name, description: board.description, background: board.background });
  }

  async function deleteBoard(e, board) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${board.name}" and all of its lists and cards? This cannot be undone.`)) return;
    try {
      await api(`/api/boards/${board.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  function closeBoardForm() {
    setShowBoard(null);
    setEditingBoard(null);
    setBoardForm({ name: "", description: "", background: "#0d7377" });
  }

  async function addMember(wsId, userId) {
    await api(`/api/workspaces/${wsId}/members`, { method: "POST", body: JSON.stringify({ user_id: Number(userId), role: "member" }) });
    load();
  }

  return (
    <div className="app-shell">
      <Topbar user={user} />
      <div className="page">
        <div className="h-row">
          <div>
            <h1 style={{ margin: 0 }}>Workspaces</h1>
            <div className="muted">Organize boards, people, and delivery work.</div>
          </div>
          <button className="btn" onClick={() => setShowWs(true)}>New workspace</button>
        </div>
        {error && <div className="error">{error}</div>}
        {workspaces.map((ws) => {
          const canCreateBoard = ["workspace_admin", "board_admin", "member"].includes(ws.role);
          return (
            <div key={ws.id} className="panel" style={{ marginBottom: 18 }}>
              <div className="h-row">
                <div>
                  <strong>{ws.name}</strong> <span className="badge">{ws.code}</span>
                  <div className="muted">{ws.description}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {ws.role === "workspace_admin" && (
                    <Link className="btn ghost small" to={`/workspaces/${ws.id}/members`}>Manage members</Link>
                  )}
                  {canCreateBoard && (
                    <button className="btn small" onClick={() => setShowBoard(ws.id)}>New board</button>
                  )}
                </div>
              </div>
              <div className="grid cards-3">
                {ws.boards.map((b) => (
                  <div key={b.id} className="board-tile" style={{ background: b.background }} onClick={() => nav(`/board/${b.id}`)}>
                    <div className="board-tile-heading">
                      <div>{b.name} {b.visibility === "private" && <span className="badge">Private</span>}</div>
                      {b.can_manage && (
                        <div className="board-tile-actions">
                          <button className="btn ghost small" onClick={(e) => editBoard(e, b)}>Edit</button>
                          <button className="btn danger small" onClick={(e) => deleteBoard(e, b)}>Delete</button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 500, fontSize: 12, opacity: 0.9 }}>{b.description}</div>
                  </div>
                ))}
                {!ws.boards.length && <div className="muted">No boards yet.</div>}
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ marginBottom: 8 }}>Members</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {ws.members.map((m) => (
                    <span key={m.id} className="badge">{m.first_name || m.username} · {m.role.replace("_", " ")}</span>
                  ))}
                  {ws.role === "workspace_admin" && (
                    <select className="search" defaultValue="" onChange={(e) => { if (e.target.value) addMember(ws.id, e.target.value); e.target.value = ""; }}>
                      <option value="">Add member</option>
                      {users.filter((u) => !ws.members.some((m) => m.id === u.id)).map((u) => (
                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showWs && (
        <div className="modal-backdrop" onClick={() => setShowWs(false)}>
          <form className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={createWorkspace}>
            <h2>Create workspace</h2>
            <div className="field"><label>Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Code</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="field"><label>Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <button className="btn">Create</button>
          </form>
        </div>
      )}
      {(showBoard || editingBoard) && (
        <div className="modal-backdrop" onClick={closeBoardForm}>
          <form className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={createBoard}>
            <h2>{editingBoard ? "Edit board" : "Create board"}</h2>
            {!editingBoard && workspaces.find((ws) => ws.id === showBoard)?.role !== "workspace_admin" && (
              <p className="muted">Boards you create here are private and visible only to you.</p>
            )}
            <div className="field"><label>Name</label><input required value={boardForm.name} onChange={(e) => setBoardForm({ ...boardForm, name: e.target.value })} /></div>
            <div className="field"><label>Description</label><textarea value={boardForm.description} onChange={(e) => setBoardForm({ ...boardForm, description: e.target.value })} /></div>
            <div className="field"><label>Background</label><input value={boardForm.background} onChange={(e) => setBoardForm({ ...boardForm, background: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn">{editingBoard ? "Save changes" : "Create"}</button>
              <button type="button" className="btn ghost" onClick={closeBoardForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
