import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { parseServerDate } from "../dates";
import Topbar from "../components/Topbar.jsx";

const WORKSPACE_ROLES = ["workspace_admin", "board_admin", "member", "guest", "viewer"];
const BOARD_ROLES = ["board_admin", "member", "viewer"];

function roleName(role) {
  return role.replaceAll("_", " ");
}

export default function Members({ user }) {
  const { id } = useParams();
  const [access, setAccess] = useState(null);
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [inviteLink, setInviteLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setAccess(await api(`/api/workspaces/${id}/access`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function updateWorkspaceMember(memberId, updates) {
    try {
      await api(`/api/workspaces/${id}/members/${memberId}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      setError("");
      setMessage("Member access updated.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeWorkspaceMember(member) {
    if (!window.confirm(`Remove ${member.email} from this workspace?`)) return;
    try {
      await api(`/api/workspaces/${id}/members/${member.id}`, { method: "DELETE" });
      setError("");
      setMessage("Member removed from the workspace.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateBoardAccess(boardId, userId, role) {
    try {
      if (role === "inherit") {
        await api(`/api/boards/${boardId}/members/${userId}`, { method: "DELETE" });
      } else {
        await api(`/api/boards/${boardId}/members/${userId}`, {
          method: "PUT",
          body: JSON.stringify({ role }),
        });
      }
      setError("");
      setMessage("Board access updated.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createInvite(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setInviteLink("");
    try {
      const created = await api(`/api/workspaces/${id}/invitations`, {
        method: "POST",
        body: JSON.stringify(invite),
      });
      const link = created.link || `${window.location.origin}/invite/${created.token}`;
      if (created.email_sent) {
        setMessage(`Invitation email sent to ${created.email}.`);
      } else {
        setInviteLink(link);
        setError(`Invitation created, but the email could not be sent (${created.email_error}). Share the link below manually.`);
      }
      setInvite({ email: "", role: "member" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function revokeInvite(invitation) {
    if (!window.confirm(`Revoke the pending invitation for ${invitation.email}?`)) return;
    try {
      await api(`/api/workspaces/${id}/invitations/${invitation.id}`, { method: "DELETE" });
      setMessage("Invitation revoked.");
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!access) {
    return <div className="page">{error || "Loading member access..."}</div>;
  }

  return (
    <div className="app-shell">
      <Topbar user={user} />
      <main className="page">
        <div className="h-row">
          <div>
            <h1 style={{ margin: 0 }}>Manage members</h1>
            <div className="muted">{access.workspace.name} · workspace roles, board access, and invitations</div>
          </div>
          <Link className="btn ghost small" to="/">Back to boards</Link>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {message && <div className="hint" role="status" style={{ marginBottom: 14 }}>{message}</div>}

        <section className="panel member-panel">
          <h2>Invite a member</h2>
          <p className="muted">Create a secure 7-day invite link and open a prefilled Gmail message. Access is granted when the recipient accepts.</p>
          <form className="member-invite-form" onSubmit={createInvite}>
            <div className="field">
              <label htmlFor="invite-email">Email address</label>
              <input id="invite-email" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="invite-role">Workspace role</label>
              <select id="invite-role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                {WORKSPACE_ROLES.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}
              </select>
            </div>
            <button className="btn">Create invite &amp; open Gmail</button>
          </form>
          {inviteLink && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="invite-link">Invitation link</label>
              <input id="invite-link" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
            </div>
          )}
        </section>

        <section className="panel member-panel">
          <h2>Workspace members</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Member</th><th>Role</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {access.members.map((member) => {
                  const isOwner = member.id === access.workspace.owner_id;
                  const ownsBoard = access.boards.some((board) => board.owner_id === member.id);
                  return (
                    <tr key={member.id}>
                      <td><strong>{member.first_name || member.username}</strong><div className="muted">{member.email}</div></td>
                      <td>
                        <select
                          aria-label={`Workspace role for ${member.email}`}
                          className="search role-select"
                          value={member.role}
                          disabled={isOwner}
                          onChange={(e) => updateWorkspaceMember(member.id, { role: e.target.value })}
                        >
                          {WORKSPACE_ROLES.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}
                        </select>
                      </td>
                      <td><span className={`badge ${member.status === "active" ? "status-active" : "status-inactive"}`}>{member.status}</span></td>
                      <td>
                        <div className="member-actions">
                          {!isOwner && (
                            <button
                              className="btn ghost small"
                              disabled={member.status === "active" && ownsBoard}
                              title={ownsBoard ? "Transfer board ownership before deactivating or removing this member." : undefined}
                              onClick={() => updateWorkspaceMember(member.id, { status: member.status === "active" ? "inactive" : "active" })}
                            >
                              {member.status === "active" ? "Deactivate" : "Reactivate"}
                            </button>
                          )}
                          {!isOwner && (
                            <button
                              className="btn danger small"
                              disabled={ownsBoard}
                              title={ownsBoard ? "Transfer board ownership before deactivating or removing this member." : undefined}
                              onClick={() => removeWorkspaceMember(member)}
                            >
                              Remove
                            </button>
                          )}
                          {isOwner && <span className="muted">Workspace owner</span>}
                          {!isOwner && ownsBoard && <span className="muted">Transfer board ownership first</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel member-panel">
          <h2>Board access</h2>
          <p className="muted">Choose a board role override or let the member inherit their workspace role. Viewers cannot edit board content.</p>
          {!access.boards.length && <div className="muted">No boards in this workspace yet.</div>}
          {access.boards.map((board) => (
            <div className="board-access" key={board.id}>
              <h3>{board.name}</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Member</th><th>Board access</th></tr></thead>
                  <tbody>
                    {access.members.map((member) => {
                      const override = board.members.find((entry) => entry.user_id === member.id);
                      const value = override?.role || "inherit";
                      return (
                        <tr key={member.id}>
                          <td>{member.first_name || member.username}<div className="muted">{member.email}</div></td>
                          <td>
                            <select
                              aria-label={`Board access for ${member.email} on ${board.name}`}
                              className="search role-select"
                              value={value}
                              disabled={member.status !== "active" || member.id === board.owner_id}
                              onChange={(e) => updateBoardAccess(board.id, member.id, e.target.value)}
                            >
                              <option value="inherit">Inherit workspace role</option>
                              {BOARD_ROLES.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}
                            </select>
                            {member.id === board.owner_id && <span className="muted"> · Board owner</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>

        <section className="panel member-panel">
          <h2>Pending invitations</h2>
          {!access.invitations.length ? <div className="muted">No pending invitations.</div> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
                <tbody>
                  {access.invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>{invitation.email}</td>
                      <td>{roleName(invitation.role)}</td>
                      <td>{parseServerDate(invitation.expires_at)?.toLocaleDateString()}</td>
                      <td><button className="btn danger small" onClick={() => revokeInvite(invitation)}>Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
