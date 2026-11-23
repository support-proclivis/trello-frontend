import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api } from "../api";
import { sortAlphabetically } from "../sorting.js";
import { parseServerDate } from "../dates";
import Topbar from "../components/Topbar.jsx";
import MemberDashboard from "./MemberDashboard.jsx";
import { CardModal } from "./BoardPage.jsx";

export default function Dashboard({ user }) {
  const nav = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [showWs, setShowWs] = useState(false);
  const [showBoard, setShowBoard] = useState(null);
  const [editingBoard, setEditingBoard] = useState(null);
  const [searchWorkspace, setSearchWorkspace] = useState(null);
  const [cardSearchQuery, setCardSearchQuery] = useState("");
  const [cardSearchMemberId, setCardSearchMemberId] = useState("");
  const [cardSearchResults, setCardSearchResults] = useState(null);
  const [cardSearchTotal, setCardSearchTotal] = useState(0);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [cardSearchError, setCardSearchError] = useState("");
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [boardForm, setBoardForm] = useState({ name: "", description: "", background: "#0d7377" });
  const [error, setError] = useState("");
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [dueTodayOpen, setDueTodayOpen] = useState(false);
  const [dueTodayCards, setDueTodayCards] = useState([]);
  const [dueTodayLoading, setDueTodayLoading] = useState(false);
  const [dueTodayError, setDueTodayError] = useState("");
  const [openingCardId, setOpeningCardId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardDetailError, setCardDetailError] = useState("");

  function istToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function displayDueDate(value) {
    const date = parseServerDate(value);
    if (!date || Number.isNaN(date.getTime())) return "No due date";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  async function load() {
    const ws = await api("/api/workspaces");
    setWorkspaces(ws);
    setWorkspacesLoaded(true);
    if (ws.some((workspace) => workspace.is_admin)) {
      setUsers(await api("/api/users"));
    } else {
      setUsers([]);
    }
  }
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setWorkspacesLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!dueTodayOpen) return;
    let active = true;
    const today = istToday();
    setDueTodayLoading(true);
    setDueTodayError("");
    api(`/api/member-dashboard/cards?due_date_from=${today}&due_date_to=${today}&include_excluded_lists=true`)
      .then((cards) => {
        if (active) {
          setDueTodayCards(cards.filter((card) =>
            card.status !== "done" && card.due_state === "today"
          ));
        }
      })
      .catch((e) => {
        if (active) setDueTodayError(e.message);
      })
      .finally(() => {
        if (active) setDueTodayLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dueTodayOpen]);

  async function loadDueTodayCard(boardId, cardId) {
    const board = await api(`/api/boards/${boardId}`);
    const card = board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
    if (!card) throw new Error("This card is no longer available.");
    setSelectedCard({ board, card });
  }

  async function openDueTodayCard(card) {
    setOpeningCardId(card.id);
    setCardDetailError("");
    try {
      await loadDueTodayCard(card.board_id, card.id);
    } catch (e) {
      setCardDetailError(e.message);
    } finally {
      setOpeningCardId(null);
    }
  }

  async function refreshDueTodayCard() {
    if (!selectedCard) return;
    try {
      await loadDueTodayCard(selectedCard.board.id, selectedCard.card.id);
      const today = istToday();
      const cards = await api(
        `/api/member-dashboard/cards?due_date_from=${today}&due_date_to=${today}&include_excluded_lists=true`,
      );
      setDueTodayCards(cards.filter((card) =>
        card.status !== "done" && card.due_state === "today"
      ));
    } catch (e) {
      setCardDetailError(e.message);
    }
  }

  async function archiveDueTodayCard() {
    if (!selectedCard) return;
    await api(`/api/cards/${selectedCard.card.id}/archive`, { method: "POST" });
    setSelectedCard(null);
    setCardDetailError("");
    setDueTodayCards((cards) => cards.filter((card) => card.id !== selectedCard.card.id));
  }

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

  function openCardSearch(ws) {
    setSearchWorkspace(ws);
    setCardSearchQuery("");
    setCardSearchMemberId("");
    setCardSearchResults(null);
    setCardSearchTotal(0);
    setCardSearchError("");
  }

  async function searchCards(e) {
    e.preventDefault();
    const query = cardSearchQuery.trim();
    if (!query && !cardSearchMemberId) {
      setCardSearchError("Enter a card number or title, or select a member.");
      return;
    }

    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cardSearchMemberId) params.set("member_id", cardSearchMemberId);
    setCardSearchLoading(true);
    setCardSearchError("");
    try {
      const response = await api(`/api/workspaces/${searchWorkspace.id}/cards/search?${params}`);
      setCardSearchResults(response.results);
      setCardSearchTotal(response.total);
    } catch (e) {
      setCardSearchError(e.message);
    } finally {
      setCardSearchLoading(false);
    }
  }

  const hasWorkspaceAdminRole = workspaces.some((ws) =>
    ["workspace_admin", "board_admin"].includes(ws.role),
  );
  const isAdminDashboard = workspaces.some((ws) => ws.is_admin);
  const hasMemberWorkspaceRole = workspaces.some((ws) => ws.role === "member");
  const viewMembers = Array.from(
    workspaces
      .flatMap((workspace) => (workspace.members || []).filter((member) => member.status === "active"))
      .reduce((membersById, member) => {
        if (!membersById.has(member.id)) membersById.set(member.id, member);
        return membersById;
      }, new Map())
      .values(),
  );
  const useMemberDashboard = workspacesLoaded
    && workspaces.length > 0
    && (hasMemberWorkspaceRole || (!hasWorkspaceAdminRole && workspaces.every((ws) => !ws.is_admin)));

  if (dueTodayOpen) {
    const memberViewExtra = isAdminDashboard ? (
      <>
        <button
          type="button"
          className="nav-link top-due-button"
          onClick={() => setDueTodayOpen(false)}
        >
          Back to dashboard
        </button>
        <select
          className="search member-view-select"
          aria-label="View dashboard as member"
          title="View dashboard as member"
          value=""
          onChange={(event) => {
            if (event.target.value) setSelectedMemberId(event.target.value);
            setDueTodayOpen(false);
          }}
        >
          <option value="">Admin view</option>
          {sortAlphabetically(
            viewMembers,
            (member) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username,
          ).map((member) => (
            <option key={member.id} value={member.id}>
              {member.member_category
                ? `[${member.member_category.charAt(0).toUpperCase() + member.member_category.slice(1)}] `
                : "[Unassigned] "}
              {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.username}
            </option>
          ))}
        </select>
      </>
    ) : null;

    return (
      <div className="app-shell">
        <Topbar
          user={user}
          extra={memberViewExtra}
        />
        <main className="page member-dashboard-page">
          <div className="member-dashboard-heading">
            <div>
              <h1>Due Today</h1>
              <p className="muted">All cards due today across your administered workspaces.</p>
            </div>
          </div>
          {dueTodayError && <div className="error member-dashboard-error">{dueTodayError}</div>}
          <section className="panel member-task-resource" aria-labelledby="due-today-title">
            <div className="member-task-resource-heading">
              <h2 id="due-today-title">Cards due today</h2>
              <span className="badge">
                {dueTodayCards.length} {dueTodayCards.length === 1 ? "card" : "cards"}
              </span>
            </div>
            {dueTodayLoading && <div className="muted member-task-message">Loading cards...</div>}
            {!dueTodayLoading && !dueTodayError && !dueTodayCards.length && (
              <div className="muted member-task-message">No cards are due today.</div>
            )}
            {!!dueTodayCards.length && (
              <div className="member-task-table-wrap">
                <table className="member-task-table">
                  <thead>
                    <tr>
                      <th scope="col">Sr. No.</th>
                      <th scope="col">Card Number</th>
                      <th scope="col">Workspace</th>
                      <th scope="col">Board Name</th>
                      <th scope="col">List Name</th>
                      <th scope="col">Member Name</th>
                      <th scope="col">Card Title</th>
                      <th scope="col">Due Date</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueTodayCards.map((card, index) => (
                      <tr key={card.id}>
                        <td>{index + 1}</td>
                        <td><span className="badge">{card.card_uid}</span></td>
                        <td>{card.workspace_name || "-"}</td>
                        <td>{card.board_name}</td>
                        <td>{card.list_name}</td>
                        <td>{card.member_name || "Unassigned"}</td>
                        <td>
                          <button
                            type="button"
                            className="member-task-title"
                            onClick={() => openDueTodayCard(card)}
                            disabled={openingCardId === card.id}
                          >
                            {card.title}
                          </button>
                        </td>
                        <td>
                          <span className="badge member-task-due is-today">
                            Today · {displayDueDate(card.due_date)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => openDueTodayCard(card)}
                            disabled={openingCardId === card.id}
                          >
                            {openingCardId === card.id ? "Opening..." : "View Card Details"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
        {selectedCard && (
          <CardModal
            card={selectedCard.card}
            board={selectedCard.board}
            user={user}
            error={cardDetailError}
            onError={setCardDetailError}
            onClose={() => {
              setSelectedCard(null);
              setCardDetailError("");
            }}
            onChange={refreshDueTodayCard}
            onArchive={archiveDueTodayCard}
            onTransferComplete={() => {
              setSelectedCard(null);
              setCardDetailError("");
              void (async () => {
                const today = istToday();
                const cards = await api(
                  `/api/member-dashboard/cards?due_date_from=${today}&due_date_to=${today}&include_excluded_lists=true`,
                );
                setDueTodayCards(cards.filter((item) =>
                  item.status !== "done" && item.due_state === "today"
                ));
              })();
            }}
            showStatus
          />
        )}
      </div>
    );
  }

  if (selectedMemberId && hasWorkspaceAdminRole) {
    const selectedMember = viewMembers.find((member) => String(member.id) === String(selectedMemberId));
    if (selectedMember) {
      const memberViewExtra = (
        <>
          {isAdminDashboard && (
            <button
              type="button"
              className="nav-link top-due-button"
              onClick={() => setDueTodayOpen(true)}
            >
              Due Today
            </button>
          )}
          <select
            className="search member-view-select"
            aria-label="View dashboard as member"
            title="View dashboard as member"
            value={selectedMemberId}
            onChange={(event) => setSelectedMemberId(event.target.value)}
          >
            <option value="">Admin view</option>
            {sortAlphabetically(
              viewMembers,
              (member) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username,
            ).map((member) => (
              <option key={member.id} value={member.id}>
                {member.member_category
                  ? `[${member.member_category.charAt(0).toUpperCase() + member.member_category.slice(1)}] `
                  : "[Unassigned] "}
                {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.username}
              </option>
            ))}
          </select>
        </>
      );
      return (
        <MemberDashboard
          user={user}
          viewedMember={selectedMember}
          memberViewExtra={memberViewExtra}
        />
      );
    }
  }

  if (useMemberDashboard) {
    return <MemberDashboard user={user} />;
  }

  if (!workspacesLoaded) {
    return (
      <div className="app-shell">
        <Topbar
          user={user}
          extra={isAdminDashboard ? (
            <>
              <button
                type="button"
                className="nav-link top-due-button"
                onClick={() => setDueTodayOpen(true)}
              >
                Due Today
              </button>
              <select
                className="search member-view-select"
                aria-label="View dashboard as member"
                title="View dashboard as member"
                value={selectedMemberId}
                onChange={(event) => setSelectedMemberId(event.target.value)}
              >
                <option value="">Admin view</option>
                {sortAlphabetically(
                  viewMembers,
                  (member) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username,
                ).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.member_category
                      ? `[${member.member_category.charAt(0).toUpperCase() + member.member_category.slice(1)}] `
                      : "[Unassigned] "}
                    {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.username}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        />
        <div className="page muted">Loading workspaces...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar
        user={user}
        extra={isAdminDashboard ? (
          <>
            <button
              type="button"
              className="nav-link top-due-button"
              onClick={() => setDueTodayOpen(true)}
            >
              Due Today
            </button>
            <select
              className="search member-view-select"
              aria-label="View dashboard as member"
              title="View dashboard as member"
              value={selectedMemberId}
              onChange={(event) => setSelectedMemberId(event.target.value)}
            >
              <option value="">Admin view</option>
              {sortAlphabetically(
                viewMembers,
                (member) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username,
              ).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.member_category
                    ? `[${member.member_category.charAt(0).toUpperCase() + member.member_category.slice(1)}] `
                    : "[Unassigned] "}
                  {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.username}
                </option>
              ))}
            </select>
          </>
        ) : null}
      />
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
                    <>
                      <button className="btn ghost small" onClick={() => openCardSearch(ws)}>Search cards</button>
                      <Link className="btn ghost small" to={`/workspaces/${ws.id}/members`}>Manage members</Link>
                    </>
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
                    <div className="board-tile-details">
                      {b.description && <div className="board-tile-description">{b.description}</div>}
                      <span className="board-tile-count">
                        {b.card_count} {b.card_count === 1 ? "card" : "cards"} · {b.overdue_count} overdue
                      </span>
                    </div>
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
                      {sortAlphabetically(
                        users.filter((u) => !ws.members.some((m) => m.id === u.id)),
                        (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username,
                      ).map((u) => (
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

      {searchWorkspace && (
        <div className="modal-backdrop" onClick={() => setSearchWorkspace(null)}>
          <div
            className="modal workspace-card-search"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-card-search-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="workspace-card-search-title">Search cards in {searchWorkspace.name}</h2>
            <form onSubmit={searchCards}>
              <div className="workspace-card-search-fields">
                <div className="field">
                  <label htmlFor="card-search-query">Card number or title</label>
                  <input
                    id="card-search-query"
                    value={cardSearchQuery}
                    onChange={(e) => setCardSearchQuery(e.target.value)}
                    placeholder="For example, CARD-123 or release plan"
                  />
                </div>
                <div className="field">
                  <label htmlFor="card-search-member">Assigned member</label>
                  <select
                    id="card-search-member"
                    className="search"
                    value={cardSearchMemberId}
                    onChange={(e) => setCardSearchMemberId(e.target.value)}
                  >
                    <option value="">All members</option>
                    {sortAlphabetically(
                      searchWorkspace.members.filter((member) => member.status === "active"),
                      (member) => [member.first_name, member.last_name].filter(Boolean).join(" ") || member.username,
                    ).map((member) => (
                      <option key={member.id} value={member.id}>
                        {[member.first_name, member.last_name].filter(Boolean).join(" ") || member.username}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="workspace-card-search-actions">
                <button className="btn" type="submit" disabled={cardSearchLoading}>
                  {cardSearchLoading ? "Searching..." : "Search"}
                </button>
                <button className="btn ghost" type="button" onClick={() => setSearchWorkspace(null)}>Close</button>
              </div>
            </form>
            {cardSearchError && <div className="error" role="alert">{cardSearchError}</div>}
            {cardSearchResults && (
              <div className="workspace-card-search-results" aria-live="polite">
                <div className="muted" style={{ marginBottom: 8 }}>
                  {cardSearchTotal} {cardSearchTotal === 1 ? "card found" : "cards found"}
                  {cardSearchTotal > cardSearchResults.length && `; showing first ${cardSearchResults.length}`}
                </div>
                {cardSearchResults.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="workspace-card-search-result"
                    onClick={() => {
                      setSearchWorkspace(null);
                      nav(`/board/${card.board_id}`, { state: { openCardId: card.id } });
                    }}
                  >
                    <span><strong>{card.title}</strong> <span className="muted">{card.card_uid}</span></span>
                    <span className="muted">{card.board_name} · {card.list_name}</span>
                  </button>
                ))}
                {!cardSearchResults.length && <div className="muted">No matching cards found.</div>}
              </div>
            )}
          </div>
        </div>
      )}

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
