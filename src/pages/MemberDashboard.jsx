import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { parseServerDate } from "../dates";
import Topbar from "../components/Topbar.jsx";
import { CardModal } from "./BoardPage.jsx";

const EXCLUDED_LIST_NAMES = new Set(["deployed in prod", "tested ok"]);

function normalizeListName(name) {
  return String(name || "").trim().toLowerCase();
}

function defaultSelectedListNames(names) {
  return names.filter((name) => !EXCLUDED_LIST_NAMES.has(normalizeListName(name)));
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

export default function MemberDashboard({ user, viewedMember = null, memberViewExtra = null }) {
  const [cards, setCards] = useState([]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [listOptions, setListOptions] = useState([]);
  const [selectedListNames, setSelectedListNames] = useState(null);
  const [listOptionsLoading, setListOptionsLoading] = useState(true);
  const [listOptionsError, setListOptionsError] = useState("");
  const [showListFilter, setShowListFilter] = useState(false);
  const listFilterRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openingCardId, setOpeningCardId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createBoards, setCreateBoards] = useState([]);
  const [createBoardsLoading, setCreateBoardsLoading] = useState(false);
  const [createBoardId, setCreateBoardId] = useState("");
  const [createListId, setCreateListId] = useState("");
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDescription, setNewCardDescription] = useState("");
  const [createCardError, setCreateCardError] = useState("");
  const [creatingCard, setCreatingCard] = useState(false);
  const includeExcludedLists = (selectedListNames || []).some((name) => (
    EXCLUDED_LIST_NAMES.has(normalizeListName(name))
  ));

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (dateFrom) params.set("due_date_from", dateFrom);
      if (dateTo) params.set("due_date_to", dateTo);
      if (viewedMember?.id) params.set("view_as_member_id", String(viewedMember.id));
      if (includeExcludedLists) params.set("include_excluded_lists", "true");
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
  }, [query, dateFrom, dateTo, refreshKey, includeExcludedLists, viewedMember?.id]);

  useEffect(() => {
    let active = true;
    const params = viewedMember?.id
      ? `?view_as_member_id=${encodeURIComponent(viewedMember.id)}`
      : "";
    api(`/api/accessible-boards${params}`)
      .then((boards) => {
        if (!active) return;
        const names = [...new Set(boards.flatMap((board) => (
          (board.lists || []).map((list) => list.name?.trim()).filter(Boolean)
        )))].sort((left, right) => left.localeCompare(right));
        setListOptions(names);
        setSelectedListNames(defaultSelectedListNames(names));
      })
      .catch((e) => {
        if (active) setListOptionsError(e.message);
      })
      .finally(() => {
        if (active) setListOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [viewedMember?.id]);

  useEffect(() => {
    if (!showListFilter) return undefined;
    function closeOnOutsideClick(event) {
      if (!listFilterRef.current?.contains(event.target)) setShowListFilter(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showListFilter]);

  async function loadSelectedBoard(boardId, cardId) {
    const params = viewedMember?.id
      ? `?view_as_member_id=${encodeURIComponent(viewedMember.id)}`
      : "";
    const board = await api(`/api/boards/${boardId}${params}`);
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

  async function openCreateCard() {
    setShowCreateCard(true);
    setCreateBoardsLoading(true);
    setCreateCardError("");
    setCreateBoards([]);
    setCreateBoardId("");
    setCreateListId("");
    setNewCardTitle("");
    setNewCardDescription("");
    try {
      const params = viewedMember?.id
        ? `?view_as_member_id=${encodeURIComponent(viewedMember.id)}`
        : "";
      const boards = await api(`/api/accessible-boards${params}`);
      const writableBoards = boards.filter((board) => board.writable && board.lists?.length);
      setCreateBoards(writableBoards);
      setCreateBoardId(String(writableBoards[0]?.id || ""));
      setCreateListId(String(writableBoards[0]?.lists[0]?.id || ""));
    } catch (e) {
      setCreateCardError(e.message);
    } finally {
      setCreateBoardsLoading(false);
    }
  }

  async function createCard(event) {
    event.preventDefault();
    if (!newCardTitle.trim() || !createListId || creatingCard) return;
    setCreatingCard(true);
    setCreateCardError("");
    let createdCard;
    try {
      createdCard = await api("/api/cards", {
        method: "POST",
        body: JSON.stringify({
          title: newCardTitle.trim(),
          description: newCardDescription,
          list_id: Number(createListId),
        }),
      });
      setShowCreateCard(false);
      setRefreshKey((key) => key + 1);
    } catch (e) {
      setCreateCardError(e.message);
      return;
    } finally {
      setCreatingCard(false);
    }
    setDetailError("");
    try {
      await loadSelectedBoard(createdCard.board_id, createdCard.id);
    } catch (e) {
      setDetailError(e.message);
    }
  }

  const resourceName = viewedMember
    ? [viewedMember.first_name, viewedMember.last_name].filter(Boolean).join(" ") || viewedMember.username || "Member"
    : [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "Member";
  const selectedBoard = createBoards.find((board) => String(board.id) === createBoardId);
  const visibleCards = cards.filter((card) => (
    query.trim() || dateFrom || dateTo || selectedListNames === null || selectedListNames.includes(card.list_name)
  ));

  return (
    <div className="app-shell">
      <Topbar user={user} extra={memberViewExtra} />
      <main className="page member-dashboard-page">
        <div className="member-dashboard-heading">
          <div>
            <h1>My Tasks</h1>
            <p className="muted">Cards assigned to you, organized by resource.</p>
          </div>
          <button type="button" className="btn" onClick={openCreateCard}>Create card</button>
        </div>

        <section className="panel member-dashboard-controls" aria-label="Task filters">
          <label className="member-task-search">
            <span>Search cards</span>
            <input
              type="search"
              className="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search card number, title, board, or list"
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
          <div className="member-task-list-filter" ref={listFilterRef}>
            <span>List name</span>
            <button
              type="button"
              className="search member-filter-trigger"
              aria-label="Filter cards by list name"
              aria-expanded={showListFilter}
              aria-haspopup="listbox"
              onClick={() => setShowListFilter((open) => !open)}
            >
              {listOptionsLoading
                ? "Loading lists..."
                : `Lists (${selectedListNames?.length || 0}/${listOptions.length})`}
              <span aria-hidden="true">{showListFilter ? "▴" : "▾"}</span>
            </button>
            {showListFilter && (
              <div className="member-filter-options" role="listbox" aria-label="Filter cards by list name" aria-multiselectable="true">
                {listOptionsLoading && <div className="member-filter-empty">Loading list names...</div>}
                {listOptionsError && <div className="member-filter-empty">List names unavailable.</div>}
                {!listOptionsLoading && !listOptionsError && listOptions.map((name) => (
                  <label className="member-filter-option" key={name}>
                    <input
                      type="checkbox"
                      checked={selectedListNames?.includes(name) || false}
                      onChange={() => setSelectedListNames((selected) => {
                        const current = selected || [];
                        return current.includes(name)
                          ? current.filter((selectedName) => selectedName !== name)
                          : [...current, name];
                      })}
                    />
                    <span>{name}</span>
                  </label>
                ))}
                {!listOptionsLoading && !listOptionsError && !listOptions.length && (
                  <div className="member-filter-empty">No lists available.</div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn ghost member-task-reset"
            onClick={() => {
              setQuery("");
              setDateFrom("");
              setDateTo("");
              if (!listOptionsLoading && !listOptionsError) {
                setSelectedListNames(defaultSelectedListNames(listOptions));
              }
            }}
          >
            Clear filters
          </button>
        </section>

        {error && <div className="error member-dashboard-error">{error}</div>}
        {listOptionsError && <div className="error member-dashboard-error">Could not load list filters: {listOptionsError}</div>}
        {detailError && <div className="error member-dashboard-error">{detailError}</div>}
        <section className="panel member-task-resource" aria-labelledby="member-task-resource-title">
          <div className="member-task-resource-heading">
            <h2 id="member-task-resource-title">
              {resourceName}
              {viewedMember?.member_category && (
                <span className="badge" style={{ marginLeft: 8 }}>
                  {viewedMember.member_category.charAt(0).toUpperCase() + viewedMember.member_category.slice(1)}
                </span>
              )}
            </h2>
            <span className="badge">{visibleCards.length} {visibleCards.length === 1 ? "card" : "cards"}</span>
          </div>
          {loading && <div className="muted member-task-message">Loading cards...</div>}
          {!loading && !error && !visibleCards.length && (
            <div className="muted member-task-message">
              {query.trim() ? "No matching cards found." : "No assigned cards found."}
            </div>
          )}
          {!!visibleCards.length && (
            <div className="member-task-table-wrap">
              <table className="member-task-table">
                <thead>
                  <tr>
                    <th scope="col">Sr. No.</th>
                    <th scope="col">Card Number</th>
                    <th scope="col">Board Name</th>
                    <th scope="col">List Name</th>
                    <th scope="col">Card Title</th>
                    <th scope="col">Due Date</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCards.map((card, index) => (
                    <tr key={card.id}>
                      <td>{index + 1}</td>
                      <td><span className="badge">{card.card_uid}</span></td>
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
          user={viewedMember || user}
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
      {showCreateCard && (
        <div className="modal-backdrop" onClick={() => !creatingCard && setShowCreateCard(false)}>
          <form
            className="modal member-card-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-create-card-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={createCard}
          >
            <div className="h-row">
              <h2 id="member-create-card-title">Create card</h2>
              <button
                type="button"
                className="btn ghost small"
                disabled={creatingCard}
                onClick={() => setShowCreateCard(false)}
              >
                Close
              </button>
            </div>
            {createCardError && <div className="error" role="alert">{createCardError}</div>}
            {createBoardsLoading ? (
              <p className="muted">Loading writable boards...</p>
            ) : createBoards.length ? (
              <>
                <div className="field">
                  <label htmlFor="member-create-board">Board</label>
                  <select
                    id="member-create-board"
                    className="search"
                    value={createBoardId}
                    onChange={(event) => {
                      const board = createBoards.find((item) => String(item.id) === event.target.value);
                      setCreateBoardId(event.target.value);
                      setCreateListId(String(board?.lists[0]?.id || ""));
                    }}
                  >
                    {createBoards.map((board) => (
                      <option key={board.id} value={board.id}>{board.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="member-create-list">List</label>
                  <select
                    id="member-create-list"
                    className="search"
                    value={createListId}
                    onChange={(event) => setCreateListId(event.target.value)}
                    required
                  >
                    {(selectedBoard?.lists || []).map((list) => (
                      <option key={list.id} value={list.id}>{list.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="member-create-title">Title</label>
                  <input
                    id="member-create-title"
                    value={newCardTitle}
                    onChange={(event) => setNewCardTitle(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label htmlFor="member-create-description">Description</label>
                  <textarea
                    id="member-create-description"
                    value={newCardDescription}
                    onChange={(event) => setNewCardDescription(event.target.value)}
                  />
                </div>
                <div className="workspace-card-search-actions">
                  <button
                    type="submit"
                    className="btn"
                    disabled={creatingCard || !newCardTitle.trim() || !createListId}
                  >
                    {creatingCard ? "Creating..." : "Create card"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={creatingCard}
                    onClick={() => setShowCreateCard(false)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              !createCardError && <p className="muted">No writable boards with active lists are available.</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
