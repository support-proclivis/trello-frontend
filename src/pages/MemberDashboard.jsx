import { useEffect, useState } from "react";
import { api } from "../api";
import { parseServerDate } from "../dates";
import Topbar from "../components/Topbar.jsx";
import { CardModal } from "./BoardPage.jsx";

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

export default function MemberDashboard({ user }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openingCardId, setOpeningCardId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (dateFrom) params.set("due_date_from", dateFrom);
      if (dateTo) params.set("due_date_to", dateTo);
      const search = params.toString();
      try {
        const result = await api(`/api/member-dashboard/cards${search ? `?${search}` : ""}`);
        if (active) setCards(result);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, dateFrom, dateTo, refreshKey]);

  async function loadSelectedBoard(boardId, cardId) {
    const board = await api(`/api/boards/${boardId}`);
    const card = board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
    if (!card) throw new Error("This card is no longer available.");
    setSelectedCard({ board, card });
  }

  async function openCard(card) {
    setOpeningCardId(card.id);
    setDetailError("");
    try {
      await loadSelectedBoard(card.board_id, card.id);
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setOpeningCardId(null);
    }
  }

  async function refreshSelectedCard() {
    if (!selectedCard) return;
    const { board, card } = selectedCard;
    try {
      await loadSelectedBoard(board.id, card.id);
      setRefreshKey((key) => key + 1);
    } catch (e) {
      setDetailError(e.message);
    }
  }

  async function archiveSelectedCard() {
    if (!selectedCard) return;
    await api(`/api/cards/${selectedCard.card.id}/archive`, { method: "POST" });
    setSelectedCard(null);
    setDetailError("");
    setRefreshKey((key) => key + 1);
  }

  async function completeTransfer() {
    setSelectedCard(null);
    setDetailError("");
    setRefreshKey((key) => key + 1);
  }

  const resourceName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "Member";

  return (
    <div className="app-shell">
      <Topbar user={user} />
      <main className="page member-dashboard-page">
        <div className="member-dashboard-heading">
          <div>
            <h1>My Tasks</h1>
            <p className="muted">Cards assigned to you, organized by resource.</p>
          </div>
        </div>

        <section className="panel member-dashboard-controls" aria-label="Task filters">
          <label className="member-task-search">
            <span>Search cards</span>
            <input
              type="search"
              className="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, board, or list"
            />
          </label>
          <label className="member-task-date">
            <span>Due date from</span>
            <input type="date" className="search" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="member-task-date">
            <span>Due date to</span>
            <input type="date" className="search" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn ghost member-task-reset"
            onClick={() => {
              setQuery("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear filters
          </button>
        </section>

        {error && <div className="error member-dashboard-error">{error}</div>}
        {detailError && <div className="error member-dashboard-error">{detailError}</div>}
        <section className="panel member-task-resource" aria-labelledby="member-task-resource-title">
          <div className="member-task-resource-heading">
            <h2 id="member-task-resource-title">{resourceName}</h2>
            <span className="badge">{cards.length} {cards.length === 1 ? "card" : "cards"}</span>
          </div>
          {loading && <div className="muted member-task-message">Loading cards...</div>}
          {!loading && !error && !cards.length && (
            <div className="muted member-task-message">
              {query.trim() ? "No matching cards found." : "No assigned cards found."}
            </div>
          )}
          {!!cards.length && (
            <div className="member-task-table-wrap">
              <table className="member-task-table">
                <thead>
                  <tr>
                    <th scope="col">Sr. No.</th>
                    <th scope="col">Board Name</th>
                    <th scope="col">List Name</th>
                    <th scope="col">Card Title</th>
                    <th scope="col">Due Date</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card, index) => (
                    <tr key={card.id}>
                      <td>{index + 1}</td>
                      <td>{card.board_name}</td>
                      <td>{card.list_name}</td>
                      <td>
                        <button
                          type="button"
                          className="member-task-title"
                          onClick={() => openCard(card)}
                          disabled={openingCardId === card.id}
                        >
                          {card.title}
                        </button>
                      </td>
                      <td>
                        <span className={`badge member-task-due is-${card.due_state}`}>
                          {card.due_state === "overdue" ? "Overdue · " : ""}
                          {card.due_state === "today" ? "Today · " : ""}
                          {displayDueDate(card.due_date)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => openCard(card)}
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
          error={detailError}
          onError={setDetailError}
          onClose={() => {
            setSelectedCard(null);
            setDetailError("");
          }}
          onChange={refreshSelectedCard}
          onArchive={archiveSelectedCard}
          onTransferComplete={completeTransfer}
          showStatus
        />
      )}
    </div>
  );
}
