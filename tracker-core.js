export const STORAGE_KEY = "ritm.entries.v1";

export function scoreToIndex(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return null;
  return Math.round(((numeric - 1) / 4) * 100);
}

export function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

export function getIndices(entry) {
  const energyRaw = average([entry.energyMorning, entry.energyDay, entry.energyEvening, entry.recovery]);
  const workRaw = average([entry.focus, entry.starting]);
  return {
    mood: Math.round(average([scoreToIndex(entry.mood), scoreToIndex(entry.calm)])),
    energy: scoreToIndex(energyRaw),
    work: scoreToIndex(workRaw),
    body: scoreToIndex(entry.body)
  };
}

export function formatShareText(entry) {
  const indices = getIndices(entry);
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${entry.date}T12:00:00`));
  const lines = [
    `Мой день · ${date}`,
    "",
    `Оценка дня: ${entry.dayScore}/5`,
    `Настроение: ${indices.mood}`,
    `Энергия: ${indices.energy}`,
    `Работоспособность: ${indices.work}`,
    `Телесное состояние: ${indices.body}`
  ];
  if (entry.note) lines.push("", `О дне: ${entry.note}`);
  if (entry.journal) lines.push("", "Запись:", entry.journal);
  return lines.join("\n");
}

export function upsertEntry(entries, entry) {
  const next = entries.filter((item) => item.date !== entry.date);
  next.push(entry);
  return next.sort((a, b) => a.date.localeCompare(b.date));
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function entriesToCsv(entries) {
  const fields = ["date", "dayScore", "mood", "calm", "energyMorning", "energyDay", "energyEvening", "recovery", "focus", "starting", "body", "load", "factors", "note", "journal"];
  return `\ufeff${fields.join(",")}\n${entries.map((entry) => fields.map((field) => csvCell(entry[field])).join(",")).join("\n")}`;
}

export function filterByDays(entries, days, today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= cutoff);
}
