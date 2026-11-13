import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiDownload } from "../api";
import { formatISTDateTime, parseServerDate, toLocalInputValue } from "../dates";
import Topbar from "../components/Topbar.jsx";

const PRIOS = ["critical", "high", "medium", "low", "none"];
const LIST_DRAG_TYPE = "application/x-boardly-list";
const EXPORT_COLUMNS = [
  { key: "card_uid", label: "Card ID" },
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "list", label: "Board column" },
  { key: "priority", label: "Priority" },
  { key: "start_date", label: "Start date" },
  { key: "due_date", label: "Due date" },
  { key: "labels", label: "Labels" },
  { key: "members", label: "Members" },
  { key: "created_at", label: "Created" },
  { key: "updated_at", label: "Updated" },
  { key: "location", label: "Location" },
];

function initials(u) {
  return ((u?.first_name?.[0] || u?.username?.[0] || "?") + (u?.last_name?.[0] || "")).toUpperCase();
}

function dueLabel(due) {
  if (!due) return null;
  const d = parseServerDate(due);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const overdue = d < today && !same;
  return {
    text: d.toLocaleDateString(),
    shortText: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue,
    today: same,
  };
}

function formatSystemCommentBody(body) {
  return body.replace(/\bat (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/, (_, date, time) => {
    const formatted = formatISTDateTime(`${date}T${time}:00Z`);
    return formatted ? `at ${formatted}` : `at ${date} ${time} UTC`;
  });
}

function formatActivityMessage(activity, members) {
  const actor = activity.actor?.username || "A user";
  if (activity.action === "update" && activity.field === "status") {
    if (activity.new_value === "done") return `${actor} marked as completed`;
    if (activity.old_value === "done" && activity.new_value === "open") {
      return `${actor} marked as not completed`;
    }
  }
  const oldValue = formatActivityValue(activity.field, activity.old_value, members);
  const newValue = formatActivityValue(activity.field, activity.new_value, members);
  return `${actor} ${activity.action} ${activity.field} ${oldValue ? `${oldValue} -> ${newValue}` : newValue}`;
}

function formatActivityValue(field, value, members) {
  if (value == null) return "";
  if (field === "member") {
    const memberId = Number(value);
    if (Number.isInteger(memberId) && memberId > 0) {
      return members.find((member) => member.id === memberId)?.username || value;
    }
    return value;
  }
  if (field !== "description") return value;
  return new DOMParser().parseFromString(String(value), "text/html").body.textContent || "";
}

function AttachmentLink({ attachment }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [loadError, setLoadError] = useState(false);
  const isImage = attachment.file_type?.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    let createdUrl = "";
    setObjectUrl("");
    setLoadError(false);
    apiDownload(attachment.url)
      .then((blob) => {
        createdUrl = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(createdUrl);
        else setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.id, attachment.url]);

  return (
    <a
      className="attachment-item"
      href={objectUrl || undefined}
      download={!isImage ? attachment.file_name : undefined}
      target={isImage ? "_blank" : undefined}
      rel={isImage ? "noreferrer" : undefined}
      onClick={(event) => {
        if (!objectUrl) event.preventDefault();
      }}
      aria-label={loadError ? `${attachment.file_name} unavailable` : attachment.file_name}
    >
      {isImage && objectUrl ? (
        <img src={objectUrl} alt={attachment.file_name} />
      ) : (
        <span className="attachment-file-icon" aria-hidden="true">{loadError ? "!" : "↗"}</span>
      )}
      <span className="attachment-name">{loadError ? "Attachment unavailable" : attachment.file_name}</span>
    </a>
  );
}

export default function BoardPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const boardSwitcherRef = useRef(null);
  const memberFilterRef = useRef(null);
  const [board, setBoard] = useState(null);
  const [accessibleBoards, setAccessibleBoards] = useState([]);
  const [boardSwitcherError, setBoardSwitcherError] = useState("");
  const [showBoardSwitcher, setShowBoardSwitcher] = useState(false);
  const [filter, setFilter] = useState("");
  const [prio, setPrio] = useState("");
  const [labelId, setLabelId] = useState("");
  const [memberFilterIds, setMemberFilterIds] = useState([]);
  const [showMemberFilter, setShowMemberFilter] = useState(false);
  const [card, setCard] = useState(null);
  const [newList, setNewList] = useState("");
  const [error, setError] = useState("");
  const [cardActionError, setCardActionError] = useState("");
  const [draggingListId, setDraggingListId] = useState(null);
  const [dragOverListId, setDragOverListId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [report, setReport] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showArchivedCards, setShowArchivedCards] = useState(false);
  const [showBoardMembers, setShowBoardMembers] = useState(false);

  useEffect(() => {
    if (!showBoardSwitcher) return undefined;
    function closeOnOutsideClick(event) {
      if (!boardSwitcherRef.current?.contains(event.target)) setShowBoardSwitcher(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showBoardSwitcher]);

  useEffect(() => {
    if (!showMemberFilter) return undefined;
    function closeOnOutsideClick(event) {
      if (!memberFilterRef.current?.contains(event.target)) setShowMemberFilter(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showMemberFilter]);

  async function load() {
    const b = await api(`/api/boards/${id}`);
    setBoard(b);
    if (card) {
      const fresh = b.lists.flatMap((l) => l.cards).find((c) => c.id === card.id);
      if (fresh) setCard(fresh);
    }
  }
  useEffect(() => {
    setCard(null);
    load().catch((e) => setError(e.message));
    api("/api/accessible-boards")
      .then((items) => {
        setAccessibleBoards(items);
        setBoardSwitcherError("");
      })
      .catch((e) => setBoardSwitcherError(e.message));
    api("/api/notifications").then(setNotes).catch(() => {});
    api(`/api/reports/board/${id}`).then(setReport).catch(() => {});
  }, [id]);

  const lists = board?.lists || [];
  const filteredLists = useMemo(() => {
    return lists.map((l) => ({
      ...l,
      cards: l.cards.filter((c) => {
        if (filter && !(`${c.title} ${c.card_uid}`.toLowerCase().includes(filter.toLowerCase()))) return false;
        if (prio && c.priority !== prio) return false;
        if (labelId && !c.labels.some((x) => String(x.id) === String(labelId))) return false;
        if (memberFilterIds.length && !c.members.some((member) => memberFilterIds.includes(member.id))) return false;
        return true;
      }),
    }));
  }, [lists, filter, prio, labelId, memberFilterIds]);

  async function addList(e) {
    e.preventDefault();
    if (!newList.trim()) return;
    try {
      await api("/api/lists", { method: "POST", body: JSON.stringify({ name: newList, board_id: Number(id) }) });
      setNewList("");
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function editList(listId, name) {
    try {
      await api(`/api/lists/${listId}`, { method: "PUT", body: JSON.stringify({ name }) });
      setError("");
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function deleteList(list) {
    if (!window.confirm(`Delete "${list.name}" and all cards in it? This cannot be undone.`)) return false;
    try {
      await api(`/api/lists/${list.id}`, { method: "DELETE" });
      setError("");
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function reorderList(listId, position) {
    try {
      await api(`/api/lists/${listId}/move?position=${position}`, { method: "POST" });
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function addCard(listId, title) {
    if (!title.trim()) return;
    await api("/api/cards", { method: "POST", body: JSON.stringify({ title, list_id: listId }) });
    load();
  }

  async function moveCard(cardId, listId) {
    await api(`/api/cards/${cardId}/move`, { method: "POST", body: JSON.stringify({ list_id: listId }) });
    load();
  }

  async function toggleCardCompletion(card) {
    try {
      await api(`/api/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: card.status === "done" ? "open" : "done" }),
      });
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function dropList(draggedListId, targetListId, afterTarget) {
    setDragOverListId(null);
    const draggedIndex = lists.findIndex((list) => list.id === draggedListId);
    const targetIndex = lists.findIndex((list) => list.id === targetListId);
    if (draggedIndex < 0 || draggedListId === targetListId || targetIndex < 0) return;
    const position = targetIndex + (afterTarget ? 1 : 0) - (draggedIndex < targetIndex ? 1 : 0);
    await reorderList(draggedListId, position);
  }

  if (!board) return <div className="page">{error || "Loading board..."}</div>;

  return (
    <div className="app-shell">
      <Topbar
        user={user}
        extra={
          <>
            <input className="search" placeholder="Filter cards" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="search" value={prio} onChange={(e) => setPrio(e.target.value)}>
              <option value="">All priorities</option>
              {PRIOS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="search" value={labelId} onChange={(e) => setLabelId(e.target.value)}>
              <option value="">All labels</option>
              {board.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="member-filter" ref={memberFilterRef}>
              <button
                type="button"
                className="search member-filter-trigger"
                aria-label="Filter cards by members"
                aria-expanded={showMemberFilter}
                aria-haspopup="listbox"
                onClick={() => setShowMemberFilter((open) => !open)}
              >
                {memberFilterIds.length
                  ? `${memberFilterIds.length} member${memberFilterIds.length === 1 ? "" : "s"}`
                  : "All members"}
                <span aria-hidden="true">{showMemberFilter ? "▴" : "▾"}</span>
              </button>
              {showMemberFilter && (
                <div className="member-filter-options" role="listbox" aria-label="Filter cards by members" aria-multiselectable="true">
                  {board.members.map((member) => (
                    <label className="member-filter-option" key={member.id}>
                      <input
                        type="checkbox"
                        checked={memberFilterIds.includes(member.id)}
                        onChange={() => setMemberFilterIds((selected) => (
                          selected.includes(member.id)
                            ? selected.filter((memberId) => memberId !== member.id)
                            : [...selected, member.id]
                        ))}
                      />
                      <span>{member.first_name || member.username}</span>
                    </label>
                  ))}
                  {!board.members.length && <div className="member-filter-empty">No board members available.</div>}
                </div>
              )}
            </div>
          </>
        }
      />
      <div className="board-page" style={{ background: `linear-gradient(180deg, ${board.background}, var(--board-page-end))` }}>
        <div className="board-bar">
          <div>
            <h2 style={{ margin: 0 }}>{board.name}</h2>
            <div className="muted">
              {board.description}
              {report && (
                <span className="board-summary">
                  · {report.total} cards · {report.overdue} overdue
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {board.can_manage_board_members && (
              <button className="btn ghost small" onClick={() => setShowBoardMembers(true)}>Manage members</button>
            )}
            {board.can_manage_archived_cards && (
              <button className="btn ghost small" onClick={() => setShowArchivedCards(true)}>Archived cards</button>
            )}
            <button className="btn ghost small" onClick={() => setShowImport(true)}>Import Excel</button>
            <button className="btn ghost small" onClick={() => setShowExport(true)}>Export Excel</button>
            <form onSubmit={addList} style={{ display: "flex", gap: 6 }}>
              <input className="search" placeholder="New list" value={newList} onChange={(e) => setNewList(e.target.value)} />
              <button className="btn small">Add</button>
            </form>
          </div>
        </div>
        {error && <div className="error" role="alert" style={{ padding: "8px 18px 0" }}>{error}</div>}
        <div
          className="lists"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(LIST_DRAG_TYPE)) e.preventDefault();
          }}
          onDrop={(e) => {
            const movedListId = e.dataTransfer.getData(LIST_DRAG_TYPE);
            if (!movedListId) return;
            e.preventDefault();
            reorderList(Number(movedListId), lists.length - 1);
            setDragOverListId(null);
          }}
        >
          {filteredLists.filter((l) => !l.archived).map((list) => {
            const listIndex = lists.findIndex((item) => item.id === list.id);
            return (
            <ListColumn
              key={list.id}
              list={list}
              listIndex={listIndex}
              isDragging={draggingListId === list.id}
              isDropTarget={dragOverListId === list.id && draggingListId !== list.id}
              onListDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(LIST_DRAG_TYPE, String(list.id));
                setDraggingListId(list.id);
              }}
              onListDragEnd={() => {
                setDraggingListId(null);
                setDragOverListId(null);
              }}
              onListDragOver={() => setDragOverListId(list.id)}
              onListDrop={(draggedListId, afterTarget) => dropList(draggedListId, list.id, afterTarget)}
              onAdd={(t) => addCard(list.id, t)}
              onOpen={setCard}
              onToggleCompletion={toggleCardCompletion}
              onDropCard={(cardId) => moveCard(cardId, list.id)}
              onEdit={editList}
              onDelete={deleteList}
              onReorder={(position) => reorderList(list.id, position)}
            />
            );
          })}
        </div>
      </div>
      {showExport && (
        <BoardExportModal
          boardId={board.id}
          boardName={board.name}
          lists={filteredLists}
          allLists={lists}
          filter={filter}
          priority={prio}
          labelId={labelId}
          onClose={() => setShowExport(false)}
        />
      )}
      {showImport && (
        <BoardImportModal
          boardId={board.id}
          boardName={board.name}
          onClose={() => setShowImport(false)}
          onComplete={load}
        />
      )}
      {showArchivedCards && (
        <ArchivedCardsModal
          boardId={board.id}
          onClose={() => setShowArchivedCards(false)}
          onRestored={load}
        />
      )}
      {showBoardMembers && (
        <BoardMembersModal
          board={board}
          onClose={() => setShowBoardMembers(false)}
          onChanged={load}
        />
      )}
      {card && <CardModal
        card={card}
        board={board}
        user={user}
        error={cardActionError}
        onError={setCardActionError}
        onClose={() => { setCard(null); setCardActionError(""); }}
        onChange={async () => { await load(); }}
        onArchive={async () => {
          await api(`/api/cards/${card.id}/archive`, { method: "POST" });
          setCard(null);
          setCardActionError("");
          await load();
        }}
        onTransferComplete={async (result) => {
          setCard(null);
          setCardActionError("");
          if (result.mode === "move") {
            navigate(`/board/${result.board_id}`);
          } else {
            try {
              setBoard(await api(`/api/boards/${id}`));
            } catch (e) {
              setError(e.message);
            }
          }
        }}
      />}
      <div className="board-switcher" ref={boardSwitcherRef}>
        <button className="btn board-switcher-trigger" onClick={() => setShowBoardSwitcher((open) => !open)}>
          Switch boards <span aria-hidden="true">▾</span>
        </button>
        {showBoardSwitcher && (
          <div className="board-switcher-menu">
            <strong>Accessible boards</strong>
            {boardSwitcherError && <span className="error">{boardSwitcherError}</span>}
            {accessibleBoards.length === 0 && <span className="muted">No boards available</span>}
            {accessibleBoards.map((item) => (
              <button
                key={item.id}
                className={`board-switcher-option${String(item.id) === String(id) ? " is-current" : ""}`}
                onClick={() => {
                  setShowBoardSwitcher(false);
                  if (String(item.id) !== String(id)) navigate(`/board/${item.id}`);
                }}
              >
                <span className="board-switcher-color" style={{ background: item.background }} />
                <span>{item.name}</span>
                {!item.writable && <span className="muted">View only</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardExportModal({ boardId, boardName, lists, allLists, filter, priority, labelId, onClose }) {
  const exportableLists = allLists.filter((list) => !list.archived);
  const statuses = [...new Set(exportableLists.flatMap((list) => list.cards.map((item) => item.status ?? "")))].sort();
  const [selectedColumns, setSelectedColumns] = useState(EXPORT_COLUMNS.map((column) => column.key));
  const [selectedStatuses, setSelectedStatuses] = useState(statuses);
  const [selectedListIds, setSelectedListIds] = useState(exportableLists.map((list) => list.id));
  const [dateField, setDateField] = useState("due_date");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const filteredLists = lists.filter((list) => !list.archived && selectedListIds.includes(list.id));
  const startTimestamp = startDateTime ? new Date(startDateTime).getTime() : null;
  const endTimestamp = endDateTime ? new Date(endDateTime).getTime() : null;
  const invalidDateRange = startTimestamp !== null && endTimestamp !== null && startTimestamp > endTimestamp;
  const matchingCount = filteredLists.reduce(
    (count, list) => count + list.cards.filter((item) => {
      if (!selectedStatuses.includes(item.status ?? "")) return false;
      if (!startDateTime && !endDateTime) return true;
      const value = item[dateField];
      if (!value) return false;
      const cardTimestamp = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
      if (Number.isNaN(cardTimestamp)) return false;
      return (startTimestamp === null || cardTimestamp >= startTimestamp)
        && (endTimestamp === null || cardTimestamp <= endTimestamp);
    }).length,
    0,
  );

  function toggleSelection(value, selected, setSelected) {
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  async function download() {
    if (!selectedColumns.length || !matchingCount) return;
    setExporting(true);
    setError("");
    try {
      const file = await apiDownload(`/api/boards/${boardId}/export`, {
        method: "POST",
        body: JSON.stringify({
          columns: selectedColumns,
          statuses: selectedStatuses,
          list_ids: selectedListIds,
          search: filter,
          priority,
          label_id: labelId ? Number(labelId) : null,
          date_field: dateField,
          start_datetime: startDateTime ? new Date(startDateTime).toISOString() : null,
          end_datetime: endDateTime ? new Date(endDateTime).toISOString() : null,
        }),
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      const safeBoardName = boardName.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "board";
      link.href = url;
      link.download = `${safeBoardName}-cards.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch (downloadError) {
      setError(downloadError.message || "The Excel file could not be downloaded.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(event) => event.stopPropagation()}>
        <div className="h-row">
          <div>
            <h2 id="export-title">Export board to Excel</h2>
            <div className="muted">Choose the fields, statuses, and board columns to include.</div>
          </div>
          <button className="btn ghost small" onClick={onClose} disabled={exporting}>Close</button>
        </div>
        <p className="muted export-filter-note">
          Current card search, priority, and label filters will also be applied.
        </p>
        <section className="export-section">
          <h3>Date and time range</h3>
          <div className="export-date-range">
            <label>
              <span>Date to filter</span>
              <select value={dateField} onChange={(event) => setDateField(event.target.value)}>
                <option value="due_date">Due date</option>
                <option value="start_date">Start date</option>
                <option value="created_at">Created date</option>
                <option value="updated_at">Updated date</option>
              </select>
            </label>
            <label>
              <span>Start date and time</span>
              <input type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} />
            </label>
            <label>
              <span>End date and time</span>
              <input type="datetime-local" value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} />
            </label>
          </div>
          {invalidDateRange && <div className="error" role="alert">Start date/time must be before or equal to end date/time.</div>}
        </section>
        <section className="export-section">
          <div className="h-row">
            <h3>Fields</h3>
            <div className="export-actions">
              <button className="btn ghost small" onClick={() => setSelectedColumns(EXPORT_COLUMNS.map((column) => column.key))}>Select all</button>
              <button className="btn ghost small" onClick={() => setSelectedColumns([])}>Clear</button>
            </div>
          </div>
          <div className="export-options">
            {EXPORT_COLUMNS.map((column) => (
              <label className="export-option" key={column.key}>
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(column.key)}
                  onChange={() => toggleSelection(column.key, selectedColumns, setSelectedColumns)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </section>
        <div className="export-filter-grid">
          <section className="export-section">
            <div className="h-row">
              <h3>Status</h3>
              <div className="export-actions">
                <button className="btn ghost small" onClick={() => setSelectedStatuses(statuses)}>All</button>
                <button className="btn ghost small" onClick={() => setSelectedStatuses([])}>None</button>
              </div>
            </div>
            {statuses.length ? statuses.map((status) => (
              <label className="export-option" key={status || "unspecified"}>
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => toggleSelection(status, selectedStatuses, setSelectedStatuses)}
                />
                {status || "Unspecified"}
              </label>
            )) : <div className="muted">No card statuses are available.</div>}
          </section>
          <section className="export-section">
            <div className="h-row">
              <h3>Board columns</h3>
              <div className="export-actions">
                <button className="btn ghost small" onClick={() => setSelectedListIds(exportableLists.map((list) => list.id))}>All</button>
                <button className="btn ghost small" onClick={() => setSelectedListIds([])}>None</button>
              </div>
            </div>
            {exportableLists.map((list) => (
              <label className="export-option" key={list.id}>
                <input
                  type="checkbox"
                  checked={selectedListIds.includes(list.id)}
                  onChange={() => toggleSelection(list.id, selectedListIds, setSelectedListIds)}
                />
                {list.name}
              </label>
            ))}
          </section>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="h-row export-footer">
          <span className="muted">{matchingCount} {matchingCount === 1 ? "card" : "cards"} will be exported</span>
          <button className="btn" onClick={download} disabled={exporting || invalidDateRange || !matchingCount || !selectedColumns.length}>
            {exporting ? "Preparing Excel file..." : "Download .xlsx"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardImportModal({ boardId, boardName, onClose, onComplete }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    setError("");
    try {
      const template = await apiDownload(`/api/boards/${boardId}/import-template`);
      const url = URL.createObjectURL(template);
      const link = document.createElement("a");
      const safeBoardName = boardName.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "board";
      link.href = url;
      link.download = `${safeBoardName}-card-import-template.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError.message || "The template could not be downloaded.");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function upload(event) {
    event.preventDefault();
    if (!file || importing) return;
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const importResult = await api(`/api/boards/${boardId}/import`, { method: "POST", body: form });
      setResult(importResult);
      if (!importResult.errors.length) {
        try {
          await onComplete();
        } catch (refreshError) {
          setError(`Cards were imported, but the board could not be refreshed: ${refreshError.message}`);
        }
      }
    } catch (uploadError) {
      setError(uploadError.message || "The Excel file could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !importing && !downloadingTemplate && onClose()}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(event) => event.stopPropagation()}>
        <div className="h-row">
          <div>
            <h2 id="import-title">Bulk import cards</h2>
            <div className="muted">Create new cards or update existing cards on this board.</div>
          </div>
          <button className="btn ghost small" onClick={onClose} disabled={importing || downloadingTemplate}>Close</button>
        </div>
        <div className="import-guidance">
          <p><strong>Blank Card ID</strong> creates a card; an existing Card ID (for example, CARD-107) updates that card.</p>
          <p>Blank cells keep existing values on updates. Use <code>__CLEAR__</code> to clear dates, members, labels, description, location, or cover.</p>
          <p>Use board column names exactly as shown. Enter member names, usernames, or emails, and label names separated by semicolons. Dates can be Excel dates or <code>YYYY-MM-DD HH:MM</code>.</p>
          <p>Uploads are limited to 5 MB and 500 card rows. If any row is invalid, the entire upload is rejected and no cards are changed.</p>
        </div>
        <button className="btn ghost small" type="button" onClick={downloadTemplate} disabled={downloadingTemplate || importing}>
          {downloadingTemplate ? "Preparing template..." : "Download Excel template"}
        </button>
        <form onSubmit={upload} className="import-form">
          <label className="field">
            <span>Excel workbook (.xlsx)</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importing}
              onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                setFile(selected);
                setResult(null);
                setError(selected && selected.size > 5 * 1024 * 1024 ? "Excel file must be 5 MB or smaller." : "");
              }}
            />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          {result && result.errors.length === 0 && (
            <div className="import-success" role="status">
              Import complete: {result.created} {result.created === 1 ? "card created" : "cards created"} and {result.updated} {result.updated === 1 ? "card updated" : "cards updated"}.
            </div>
          )}
          {result?.errors.length > 0 && (
            <div className="import-error-list" role="alert">
              <strong>No changes were made. Fix these rows and upload the workbook again:</strong>
              <ul>
                {result.errors.map((item) => <li key={`${item.row}-${item.message}`}>Row {item.row}: {item.message}</li>)}
              </ul>
            </div>
          )}
          <div className="h-row import-footer">
            <span className="muted">{file ? file.name : "No file selected"}</span>
            <button className="btn" type="submit" disabled={importing || !file || Boolean(error)}>
              {importing ? "Importing cards..." : "Upload and import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ListColumn({
  list,
  listIndex,
  isDragging,
  isDropTarget,
  onListDragStart,
  onListDragEnd,
  onListDragOver,
  onListDrop,
  onAdd,
  onOpen,
  onToggleCompletion,
  onDropCard,
  onEdit,
  onDelete,
  onReorder,
}) {
  const [title, setTitle] = useState("");
  const [name, setName] = useState(list.name);
  const [editing, setEditing] = useState(false);
  const [sortOrder, setSortOrder] = useState("due-priority");
  const [showListMenu, setShowListMenu] = useState(false);
  const listActionsRef = useRef(null);
  const over = list.wip_limit && list.cards.length >= list.wip_limit;

  useEffect(() => {
    setName(list.name);
  }, [list.name]);

  useEffect(() => {
    if (!showListMenu) return undefined;
    function closeOnOutsideClick(event) {
      if (!listActionsRef.current?.contains(event.target)) setShowListMenu(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showListMenu]);

  const sortedCards = [...list.cards].sort((a, b) => {
    if (sortOrder === "default") return 0;
    if (sortOrder === "name") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

    if (sortOrder === "due-priority") {
      const aDue = parseServerDate(a.due_date)?.getTime();
      const bDue = parseServerDate(b.due_date)?.getTime();
      const aHasDue = Number.isFinite(aDue);
      const bHasDue = Number.isFinite(bDue);
      if (aHasDue !== bHasDue) return aHasDue ? -1 : 1;
      if (aHasDue && aDue !== bDue) return aDue - bDue;

      const aPriority = PRIOS.indexOf((a.priority || "").toLowerCase());
      const bPriority = PRIOS.indexOf((b.priority || "").toLowerCase());
      return (aPriority < 0 ? PRIOS.length : aPriority) - (bPriority < 0 ? PRIOS.length : bPriority);
    }

    const [field, direction] = sortOrder.split(":");
    const aDate = parseServerDate(a[field])?.getTime();
    const bDate = parseServerDate(b[field])?.getTime();
    const aValid = Number.isFinite(aDate);
    const bValid = Number.isFinite(bDate);
    if (!aValid || !bValid) return aValid === bValid ? 0 : aValid ? -1 : 1;
    return direction === "desc" ? bDate - aDate : aDate - bDate;
  });

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await onEdit(list.id, name)) setEditing(false);
  }

  return (
    <section
      className={`list${isDragging ? " is-list-dragging" : ""}${isDropTarget ? " is-list-drop-target" : ""}`}
      data-list-index={listIndex}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes(LIST_DRAG_TYPE)) onListDragOver();
      }}
      onDrop={(e) => {
        const draggedListId = e.dataTransfer.getData(LIST_DRAG_TYPE);
        if (draggedListId) {
          e.preventDefault();
          e.stopPropagation();
          const bounds = e.currentTarget.getBoundingClientRect();
          onListDrop(Number(draggedListId), e.clientX >= bounds.left + bounds.width / 2);
          return;
        }
        const id = e.dataTransfer.getData("cardId");
        if (id) onDropCard(Number(id));
      }}
    >
      <div className="list-head">
        {editing ? (
          <form onSubmit={saveName} className="list-edit-form">
            <input aria-label="List name" className="search" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn small">Save</button>
            <button type="button" className="btn ghost small" onClick={() => { setName(list.name); setEditing(false); }}>Cancel</button>
          </form>
        ) : (
          <>
            <div className="list-title-wrap">
              <span
                className="list-drag-handle"
                draggable
                role="button"
                tabIndex={0}
                aria-label={`Drag ${list.name} to reorder`}
                title="Drag to reorder"
                onDragStart={onListDragStart}
                onDragEnd={onListDragEnd}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    onReorder(listIndex + (e.key === "ArrowRight" ? 1 : -1));
                  }
                }}
              >⠿</span>
              <h3>{list.name} <span className="muted">{list.cards.length}{list.wip_limit ? `/${list.wip_limit}` : ""}</span></h3>
            </div>
            <div className="list-actions" ref={listActionsRef}>
              <button
                type="button"
                className="btn ghost small list-menu-trigger"
                aria-label={`List actions for ${list.name}`}
                aria-expanded={showListMenu}
                aria-haspopup="true"
                onClick={() => setShowListMenu((open) => !open)}
              >
                ⋯
              </button>
              {showListMenu && (
                <div className="list-menu">
                  <strong>Sort list</strong>
                  {[
                    ["due-priority", "Due date (soonest first), then priority"],
                    ["created_at:desc", "Date created (newest first)"],
                    ["created_at:asc", "Date created (oldest first)"],
                    ["due_date:asc", "Due date (soonest first)"],
                    ["due_date:desc", "Due date (latest first)"],
                    ["updated_at:desc", "Last updated (newest first)"],
                    ["updated_at:asc", "Last updated (oldest first)"],
                    ["name", "Card name (A–Z)"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={sortOrder === value ? "is-selected" : ""}
                      aria-pressed={sortOrder === value}
                      onClick={() => {
                        setSortOrder(value);
                        setShowListMenu(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <div className="list-menu-divider" />
                  <button type="button" onClick={() => { setShowListMenu(false); setEditing(true); }}>Edit list</button>
                  <button type="button" className="is-danger" onClick={() => { setShowListMenu(false); onDelete(list); }}>Delete list</button>
                </div>
              )}
            </div>
          </>
        )}
        {over && <span className="prio high">WIP</span>}
      </div>
      <div className="list-cards">
        {sortedCards.map((c) => {
          const due = dueLabel(c.due_date);
          return (
            <article
              key={c.id}
              className="card"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("cardId", String(c.id))}
              onClick={() => onOpen(c)}
            >
              <div className="labels">
                {c.labels.map((l) => <span key={l.id} className="label" style={{ background: l.color }} />)}
              </div>
              <div className="card-title-row">
                <button
                  type="button"
                  className={`card-completion${c.status === "done" ? " is-completed" : ""}`}
                  aria-label={c.status === "done" ? `Mark ${c.title} as not completed` : `Mark ${c.title} as completed`}
                  aria-pressed={c.status === "done"}
                  title={c.status === "done" ? "Mark as not completed" : "Mark as completed"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCompletion(c);
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  draggable={false}
                >
                  {c.status === "done" ? "✓" : ""}
                </button>
                <div className="card-title">{c.title}</div>
              </div>
              <div className="card-meta">
                <span className={`prio ${c.priority}`}>{c.priority}</span>
                <span>{c.card_uid}</span>
                <div className="avatars">
                  {c.members.map((m) => <div key={m.id} className="avatar-sm">{initials(m)}</div>)}
                </div>
              </div>
              {due && (
                <div className={`card-due-date${c.status === "done" ? " is-completed" : due.overdue ? " is-overdue" : due.today ? " is-today" : ""}`}>
                  <span aria-hidden="true">◷</span>
                  <span>{due.shortText}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); onAdd(title); setTitle(""); }}
        style={{ display: "flex", gap: 6, marginTop: 8 }}
      >
        <input className="search" style={{ flex: 1, minWidth: 0 }} placeholder="Add a card" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn small">Add</button>
      </form>
    </section>
  );
}

function CardModal({ card, board, user, error, onError, onClose, onChange, onArchive, onTransferComplete }) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description.replace(/<[^>]+>/g, ""));
  const [comment, setComment] = useState("");
  const [mentionContext, setMentionContext] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [checkName, setCheckName] = useState("");
  const [itemName, setItemName] = useState("");
  const [due, setDue] = useState(toLocalInputValue(card.due_date));
  const [priority, setPriority] = useState(card.priority);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMemberOptions, setShowMemberOptions] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [updatingCompletion, setUpdatingCompletion] = useState(false);
  const commentTextareaRef = useRef(null);
  const descriptionTextareaRef = useRef(null);
  const memberSelectRef = useRef(null);
  const watching = card.watchers?.includes(user?.id);

  useEffect(() => {
    if (!showMemberOptions) return undefined;
    function closeOnOutsideClick(event) {
      if (!memberSelectRef.current?.contains(event.target)) setShowMemberOptions(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [showMemberOptions]);

  useLayoutEffect(() => {
    const textarea = descriptionTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [description]);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description.replace(/<[^>]+>/g, ""));
    setPriority(card.priority);
    setDue(toLocalInputValue(card.due_date));
  }, [card.id, card.updated_at]);

  async function save(updates) {
    if (!Object.keys(updates).length) return;
    try {
      await api(`/api/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
      onError("");
      await onChange();
    } catch (e) {
      onError(e.message);
    }
  }

  async function archiveCard() {
    if (!window.confirm(`Archive "${card.title}"? A board admin can restore it later.`)) return;
    try {
      await onArchive();
    } catch (e) {
      onError(e.message);
    }
  }

  async function toggleLabel(lid) {
    const has = card.labels.some((l) => l.id === lid);
    await api(`/api/cards/${card.id}/labels/${lid}`, { method: has ? "DELETE" : "POST" });
    onChange();
  }

  async function toggleMember(uid) {
    const has = card.members.some((m) => m.id === uid);
    await api(`/api/cards/${card.id}/members/${uid}`, { method: has ? "DELETE" : "POST" });
    onChange();
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!comment.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    onError("");
    try {
      const result = await api(`/api/cards/${card.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      setMentionContext(null);
      onError(result.email_warnings?.join(" ") || "");
      await onChange();
    } catch (e) {
      onError(e.message);
    } finally {
      setCommentSubmitting(false);
    }
  }

  function updateMentionContext(value, caretPosition) {
    const textBeforeCaret = value.slice(0, caretPosition);
    const match = textBeforeCaret.match(/(^|[^\w@])@([A-Za-z0-9_.-]*)$/);
    if (!match) {
      setMentionContext(null);
      setMentionIndex(0);
      return;
    }
    const start = textBeforeCaret.length - match[0].length + match[1].length;
    setMentionContext({ start, end: caretPosition, query: match[2] });
    setMentionIndex(0);
  }

  const mentionSuggestions = mentionContext
    ? (board.mentionable_users || []).filter((member) => (
      member.username.toLowerCase().startsWith(mentionContext.query.toLowerCase())
    )).slice(0, 6)
    : [];

  function selectMention(member) {
    if (!mentionContext) return;
    const before = comment.slice(0, mentionContext.start);
    const insertion = `@${member.username} `;
    const updatedComment = before + insertion + comment.slice(mentionContext.end);
    const nextCaret = before.length + insertion.length;
    setComment(updatedComment);
    setMentionContext(null);
    requestAnimationFrame(() => {
      commentTextareaRef.current?.focus();
      commentTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function addChecklist(e) {
    e.preventDefault();
    if (!checkName.trim()) return;
    await api(`/api/cards/${card.id}/checklists`, { method: "POST", body: JSON.stringify({ name: checkName }) });
    setCheckName("");
    onChange();
  }

  async function addItem(checklistId) {
    if (!itemName.trim()) return;
    await api(`/api/checklists/${checklistId}/items`, { method: "POST", body: JSON.stringify({ name: itemName }) });
    setItemName("");
    onChange();
  }

  async function toggleItem(item) {
    await api(`/api/checklist-items/${item.id}`, { method: "PUT", body: JSON.stringify({ completed: !item.completed }) });
    onChange();
  }

  async function uploadFiles(files) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    setUploadingFiles(true);
    onError("");
    const failures = [];
    let uploaded = 0;
    for (const file of selectedFiles) {
      const fd = new FormData();
      fd.append("file", file, file.name);
      try {
        await api(`/api/cards/${card.id}/attachments`, { method: "POST", body: fd });
        uploaded += 1;
      } catch (e) {
        failures.push(`${file.name || "File"}: ${e.message}`);
      }
    }
    try {
      if (uploaded) await onChange();
    } catch (e) {
      failures.push(`Could not refresh card: ${e.message}`);
    } finally {
      setUploadingFiles(false);
    }
    if (failures.length) {
      onError(failures.join(" "));
    } else {
      onError("");
    }
  }

  function handlePaste(e) {
    const pastedImages = Array.from(e.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!pastedImages.length) return;
    e.preventDefault();
    void uploadFiles(pastedImages);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDraggingFiles(false);
    void uploadFiles(e.dataTransfer.files);
  }

  async function watch() {
    await api(`/api/cards/${card.id}/watch`, { method: watching ? "DELETE" : "POST" });
    onChange();
  }

  async function moveTo(listId) {
    await api(`/api/cards/${card.id}/move`, { method: "POST", body: JSON.stringify({ list_id: Number(listId) }) });
    onChange();
  }

  async function toggleCompletion() {
    setUpdatingCompletion(true);
    onError("");
    try {
      await api(`/api/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: card.status === "done" ? "open" : "done" }),
      });
      await onChange();
    } catch (e) {
      onError(e.message);
    } finally {
      setUpdatingCompletion(false);
    }
  }

  async function transfer(payload) {
    setTransferring(true);
    setTransferError("");
    try {
      const result = await api(`/api/cards/${card.id}/transfer`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onTransferComplete(result);
    } catch (e) {
      setTransferError(e.message);
    } finally {
      setTransferring(false);
    }
  }

  const dueInfo = dueLabel(card.due_date);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${draggingFiles ? " is-file-dragging" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onPaste={handlePaste}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) {
            e.preventDefault();
            setDraggingFiles(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDraggingFiles(false);
        }}
        onDrop={handleDrop}
      >
        {error && <div className="error">{error}</div>}
        <div className="h-row modal-card-header">
          <div className="modal-card-heading">
            <div className="muted modal-card-id">{card.card_uid}</div>
            <div className="modal-card-title-row">
              <button
                type="button"
                className={`card-completion modal-card-completion${card.status === "done" ? " is-completed" : ""}`}
                onClick={toggleCompletion}
                disabled={updatingCompletion}
                aria-label={card.status === "done" ? "Mark as not completed" : "Mark as completed"}
                aria-pressed={card.status === "done"}
                title={updatingCompletion ? "Updating completion" : card.status === "done" ? "Mark as not completed" : "Mark as completed"}
              >
                {card.status === "done" ? "✓" : ""}
              </button>
              <textarea
                className="modal-card-title-input"
                value={title}
                rows={2}
                aria-label="Card title"
                onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, " "))}
                onBlur={() => {
                  if (title !== card.title) void save({ title });
                }}
              />
            </div>
          </div>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        <div className="split">
          <div>
            <div className="labels" style={{ marginBottom: 10 }}>
              {card.labels.map((l) => <span key={l.id} className="label chip" style={{ background: l.color }}>{l.name}</span>)}
              {dueInfo && (
                <span className={`badge${card.status === "done" ? " is-completed" : dueInfo.overdue ? " is-overdue" : dueInfo.today ? " is-today" : ""}`}>
                  {dueInfo.overdue ? "Overdue" : dueInfo.today ? "Due today" : dueInfo.text}
                </span>
              )}
              <span className={`prio ${card.priority}`}>{card.priority}</span>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                ref={descriptionTextareaRef}
                className="card-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description !== card.description.replace(/<[^>]+>/g, "")) {
                    void save({ description: `<p>${description}</p>` });
                  }
                }}
              />
            </div>
            <section className="attachment-section">
              <h3>Attachments</h3>
              {card.attachments.length > 0 && (
                <div className="attachment-grid">
                  {card.attachments.map((attachment) => {
                    return <AttachmentLink key={attachment.id} attachment={attachment} />;
                  })}
                </div>
              )}
              <label className={`attachment-dropzone${draggingFiles ? " is-dragging" : ""}`}>
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={uploadingFiles}
                  onChange={(e) => {
                    void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <strong>{uploadingFiles ? "Uploading attachments..." : "Add attachments"}</strong>
                <span>Drop files here or paste a copied image while this card is open</span>
                <span className="muted">Images and files up to 10 MB</span>
              </label>
            </section>
            {card.checklists.map((cl) => (
              <div className="checklist" key={cl.id}>
                <strong>{cl.name}</strong>
                {cl.items.map((it) => (
                  <label key={it.id} className={`check-item ${it.completed ? "done" : ""}`}>
                    <input type="checkbox" checked={it.completed} onChange={() => toggleItem(it)} />
                    {it.name}
                  </label>
                ))}
                <form onSubmit={(e) => { e.preventDefault(); addItem(cl.id); }} style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input className="search" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Add item" />
                  <button className="btn small">Add</button>
                </form>
              </div>
            ))}
            <form onSubmit={addChecklist} style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <input className="search" value={checkName} onChange={(e) => setCheckName(e.target.value)} placeholder="Checklist name" />
              <button className="btn small">Add checklist</button>
            </form>
            <div className="activity-panel">
              <h3>Activity</h3>
              {card.activities.slice(0, 12).map((a) => (
                <div key={a.id} className="activity">
                  <span>{formatActivityMessage(a, board.members)}</span>
                  {a.created_at && <span className="activity-time">{formatISTDateTime(a.created_at)}</span>}
                </div>
              ))}
            </div>
          </div>
          <aside className="side-actions">
            <label className="muted">Priority</label>
            <select
              className="search"
              value={priority}
              onChange={(e) => {
                const nextPriority = e.target.value;
                setPriority(nextPriority);
                if (nextPriority !== card.priority) void save({ priority: nextPriority });
              }}
            >
              {PRIOS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label className="muted">Due date</label>
            <input
              className="search"
              type="datetime-local"
              value={due}
              onChange={(e) => {
                const nextDue = e.target.value;
                if (nextDue && nextDue.slice(0, 10) !== due.slice(0, 10)) {
                  setDue(`${nextDue.slice(0, 10)}T19:00`);
                } else {
                  setDue(nextDue);
                }
              }}
              onBlur={() => {
                if (due !== toLocalInputValue(card.due_date)) {
                  void save({ due_date: due ? new Date(due).toISOString() : null });
                }
              }}
            />
            <label className="muted">Move to</label>
            <select className="search" value={card.list_id} onChange={(e) => moveTo(e.target.value)}>
              {board.lists.filter((l) => !l.archived).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn ghost small" onClick={() => { setTransferError(""); setShowTransfer(true); }}>Copy or move to another board</button>
            <label className="muted">Members</label>
            <div className="member-select" ref={memberSelectRef}>
              <button
                type="button"
                className="search member-select-trigger"
                aria-label="Select card members"
                aria-expanded={showMemberOptions}
                aria-haspopup="listbox"
                onClick={() => setShowMemberOptions((open) => !open)}
              >
                {card.members.length
                  ? `${card.members.length} member${card.members.length === 1 ? "" : "s"} selected`
                  : "Select members"}
                <span aria-hidden="true">{showMemberOptions ? "▴" : "▾"}</span>
              </button>
              {showMemberOptions && (
                <div className="member-select-options" role="listbox" aria-label="Card members" aria-multiselectable="true">
                  {board.members.map((member) => {
                    const selected = card.members.some((item) => item.id === member.id);
                    return (
                      <label className="member-select-option" key={member.id}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMember(member.id)}
                        />
                        <span>{member.first_name || member.username}</span>
                      </label>
                    );
                  })}
                  {!board.members.length && <div className="member-select-empty">No board members available.</div>}
                </div>
              )}
            </div>
            <label className="muted">Labels</label>
            {board.labels.map((l) => (
              <button key={l.id} className="btn ghost small" style={{ borderColor: l.color }} onClick={() => toggleLabel(l.id)}>
                {card.labels.some((x) => x.id === l.id) ? "Remove" : "Add"} {l.name}
              </button>
            ))}
            <button className="btn ghost small" onClick={watch}>{watching ? "Unwatch" : "Watch"}</button>
            <button className="btn danger small" onClick={archiveCard}>Archive card</button>
            <div className="comment-panel">
              <h3>Comments</h3>
              {card.comments.map((cm) => (
                <div key={cm.id} className="comment">
                  <strong>{cm.author.first_name || cm.author.username}</strong>
                  <span className="muted"> · {formatISTDateTime(cm.created_at)}</span>
                  <div>{cm.is_system ? formatSystemCommentBody(cm.body) : cm.body}</div>
                </div>
              ))}
              <form onSubmit={sendComment} className="field">
                <div className="mention-input-wrap">
                  <textarea
                    ref={commentTextareaRef}
                    value={comment}
                    onChange={(event) => {
                      setComment(event.target.value);
                      updateMentionContext(event.target.value, event.target.selectionStart);
                    }}
                    onClick={(event) => updateMentionContext(event.target.value, event.target.selectionStart)}
                    onBlur={() => setMentionContext(null)}
                    onKeyUp={(event) => {
                      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
                        updateMentionContext(event.currentTarget.value, event.currentTarget.selectionStart);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!mentionContext) return;
                      if (event.key === "ArrowDown" && mentionSuggestions.length) {
                        event.preventDefault();
                        setMentionIndex((index) => (index + 1) % mentionSuggestions.length);
                      } else if (event.key === "ArrowUp" && mentionSuggestions.length) {
                        event.preventDefault();
                        setMentionIndex((index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                      } else if (event.key === "Enter" && mentionSuggestions.length) {
                        event.preventDefault();
                        selectMention(mentionSuggestions[mentionIndex]);
                      } else if (event.key === "Escape") {
                        setMentionContext(null);
                      }
                    }}
                    placeholder="Write a comment, use @username to mention"
                    aria-label="Write a comment"
                    aria-autocomplete="list"
                    aria-expanded={Boolean(mentionContext)}
                  />
                  {mentionContext && (
                    <div className="mention-suggestions" role="listbox" aria-label="Member suggestions">
                      {mentionSuggestions.length ? mentionSuggestions.map((member, index) => (
                        <button
                          type="button"
                          key={member.id}
                          role="option"
                          aria-selected={index === mentionIndex}
                          className={index === mentionIndex ? "is-active" : ""}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectMention(member)}
                        >
                          <strong>@{member.username}</strong>
                          {(member.first_name || member.last_name) && (
                            <span>{[member.first_name, member.last_name].filter(Boolean).join(" ")}</span>
                          )}
                        </button>
                      )) : <div className="mention-suggestions-empty">No matching members</div>}
                    </div>
                  )}
                </div>
                <button className="btn small" disabled={commentSubmitting}>
                  {commentSubmitting ? "Sending..." : "Comment"}
                </button>
              </form>
            </div>
          </aside>
        </div>
      </div>
      {showTransfer && (
        <CardTransferModal
          card={card}
          currentBoardId={board.id}
          error={transferError}
          busy={transferring}
          onClose={() => setShowTransfer(false)}
          onSubmit={transfer}
        />
      )}
    </div>
  );
}

function BoardMembersModal({ board, onClose, onChanged }) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");
  const [error, setError] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const memberIds = new Set(board.members.map((member) => member.id));
  const availableUsers = users.filter((user) => user.id !== board.owner_id && !memberIds.has(user.id));

  useEffect(() => {
    api("/api/users")
      .then(setUsers)
      .catch((loadError) => setError(loadError.message));
  }, []);

  async function saveMembership(userId, role) {
    setSavingUserId(userId);
    setError("");
    try {
      await api(`/api/boards/${board.id}/members/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      await onChanged();
      return true;
    } catch (saveError) {
      setError(saveError.message);
      return false;
    } finally {
      setSavingUserId(null);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    if (!selectedUserId) return;
    if (await saveMembership(Number(selectedUserId), selectedRole)) {
      setSelectedUserId("");
    }
  }

  async function removeMember(member) {
    setSavingUserId(member.id);
    setError("");
    try {
      await api(`/api/boards/${board.id}/members/${member.id}`, { method: "DELETE" });
      await onChanged();
    } catch (removeError) {
      setError(removeError.message);
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal board-members-modal" role="dialog" aria-modal="true" aria-labelledby="board-members-title" onClick={(event) => event.stopPropagation()}>
        <div className="h-row">
          <div>
            <h2 id="board-members-title">Manage board members</h2>
            <div className="muted">Users outside the workspace get access to this board only.</div>
          </div>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <form className="board-member-add" onSubmit={addMember}>
          <select
            className="search"
            aria-label="Select a member to add"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">Select a user</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.first_name || user.username} ({user.email})
              </option>
            ))}
          </select>
          <select
            className="search"
            aria-label="Board role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
          >
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <button className="btn small" disabled={!selectedUserId || savingUserId !== null}>Add member</button>
        </form>
        <div className="board-member-list">
          {board.members.map((member) => (
            <div className="board-member-row" key={member.id}>
              <div>
                <strong>{member.first_name || member.username}</strong>
                <div className="muted">{member.email}</div>
              </div>
              {member.id === board.owner_id ? (
                <span className="badge">Board owner</span>
              ) : (
                <div className="board-member-actions">
                  <select
                    className="search"
                    aria-label={`Role for ${member.username}`}
                    value={member.role}
                    disabled={savingUserId !== null}
                    onChange={(event) => saveMembership(member.id, event.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                    <option value="board_admin">Board admin</option>
                  </select>
                  <button
                    className="btn ghost small"
                    disabled={savingUserId !== null}
                    onClick={() => removeMember(member)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {!board.members.length && <div className="muted">No board members have been added.</div>}
        </div>
      </div>
    </div>
  );
}

function ArchivedCardsModal({ boardId, onClose, onRestored }) {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState(null);

  async function loadArchivedCards() {
    setError("");
    try {
      setCards(await api(`/api/boards/${boardId}/archived-cards`));
    } catch (loadError) {
      setError(loadError.message);
    }
  }

  useEffect(() => {
    loadArchivedCards();
  }, [boardId]);

  async function restoreCard(card) {
    setRestoringId(card.id);
    setError("");
    try {
      await api(`/api/cards/${card.id}/restore`, { method: "POST" });
      await onRestored();
      await loadArchivedCards();
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal archived-cards-modal" role="dialog" aria-modal="true" aria-labelledby="archived-cards-title" onClick={(event) => event.stopPropagation()}>
        <div className="h-row">
          <div>
            <h2 id="archived-cards-title">Archived cards</h2>
            <div className="muted">Only board admins can view or restore archived cards.</div>
          </div>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {cards === null ? (
          !error && <div className="muted">Loading archived cards...</div>
        ) : cards.length ? (
          <div className="archived-card-list">
            {cards.map((card) => (
              <div className="archived-card-row" key={card.id}>
                <div>
                  <strong>{card.title}</strong>
                  <div className="muted">{card.card_uid} · {card.list_name}</div>
                </div>
                <button
                  className="btn small"
                  disabled={restoringId !== null}
                  onClick={() => restoreCard(card)}
                >
                  {restoringId === card.id ? "Restoring..." : "Restore"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted archived-cards-empty">No archived cards on this board.</div>
        )}
      </div>
    </div>
  );
}

function CardTransferModal({ card, currentBoardId, error, busy, onClose, onSubmit }) {
  const [mode, setMode] = useState("copy");
  const [boards, setBoards] = useState([]);
  const [boardsError, setBoardsError] = useState("");
  const [targetBoardId, setTargetBoardId] = useState("");
  const [targetListId, setTargetListId] = useState("");
  const [position, setPosition] = useState("1");
  const [title, setTitle] = useState(`${card.title} (copy)`);
  const [keepLabels, setKeepLabels] = useState(true);
  const [keepMembers, setKeepMembers] = useState(true);

  useEffect(() => {
    api("/api/accessible-boards")
      .then((items) => {
        const writableBoards = items.filter((item) => item.writable && String(item.id) !== String(currentBoardId));
        setBoards(writableBoards);
        if (writableBoards.length) {
          setTargetBoardId(String(writableBoards[0].id));
          setTargetListId(String(writableBoards[0].lists[0]?.id || ""));
        }
      })
      .catch((e) => setBoardsError(e.message));
  }, [currentBoardId]);

  const targetBoard = boards.find((item) => String(item.id) === targetBoardId);

  function selectBoard(value) {
    const nextBoard = boards.find((item) => String(item.id) === value);
    setTargetBoardId(value);
    setTargetListId(String(nextBoard?.lists[0]?.id || ""));
  }

  function submit(e) {
    e.preventDefault();
    if (!targetBoardId || !targetListId) return;
    void onSubmit({
      mode,
      target_board_id: Number(targetBoardId),
      target_list_id: Number(targetListId),
      position: Math.max(1, Number(position) || 1),
      title: mode === "copy" ? title : null,
      keep_labels: keepLabels,
      keep_members: keepMembers,
    });
  }

  return (
    <div className="modal-backdrop transfer-backdrop" onClick={() => !busy && onClose()}>
      <form className="modal transfer-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="h-row">
          <div>
            <h2>Copy or move card</h2>
            <div className="muted">{card.card_uid} · {card.title}</div>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose} disabled={busy}>Close</button>
        </div>
        {(boardsError || error) && <div className="error">{boardsError || error}</div>}
        {boards.length === 0 ? (
          <p className="muted transfer-empty">No other writable boards are available to you.</p>
        ) : (
          <>
            <div className="field">
              <label>Action</label>
              <select className="search" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="copy">Copy card</option>
                <option value="move">Move card</option>
              </select>
            </div>
            <div className="field">
              <label>Destination board</label>
              <select className="search" value={targetBoardId} onChange={(e) => selectBoard(e.target.value)}>
                {boards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="transfer-fields">
              <div className="field">
                <label>Destination column</label>
                <select className="search" value={targetListId} onChange={(e) => setTargetListId(e.target.value)}>
                  {(targetBoard?.lists || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Position</label>
                <input className="search" type="number" min="1" step="1" value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
            {mode === "copy" && (
              <div className="field">
                <label>Copied card title</label>
                <input className="search" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
            )}
            <label className="transfer-check">
              <input type="checkbox" checked={keepLabels} onChange={(e) => setKeepLabels(e.target.checked)} />
              Keep matching labels
            </label>
            <label className="transfer-check">
              <input type="checkbox" checked={keepMembers} onChange={(e) => setKeepMembers(e.target.checked)} />
              Keep members who can access the destination board
            </label>
            <div className="transfer-footer">
              <span className="muted">Comments and activity history are not copied.</span>
              <button className="btn" disabled={busy || !targetBoardId || !targetListId || (mode === "copy" && !title.trim())}>
                {busy ? "Working..." : mode === "copy" ? "Copy card" : "Move card"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
