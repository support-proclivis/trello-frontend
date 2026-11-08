// The API stores and returns naive UTC timestamps ("2026-11-08T04:30:00", no "Z").
// Browsers parse those as local time, so mark them as UTC before parsing.
export function parseServerDate(value) {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

// Value for <input type="datetime-local"> in the user's local time.
export function toLocalInputValue(value) {
  const d = parseServerDate(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
