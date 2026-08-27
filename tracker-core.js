export const STORAGE_KEY = "ritm.entries.v1";
export const CSV_FIELDS = ["date","dayScore","mood","calm","anxiety","irritation","interest","energyMorning","energyDay","energyEvening","recovery","sleepHours","sleepQuality","focus","starting","completion","creativity","social","body","pain","appetite","digestion","load","dayType","cycleDay","illness","positiveFactors","negativeFactors","factors","resourceNote","drainNote","note","journal"];

export function scoreToIndex(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) return null;
  return Math.round(((numeric - 1) / 4) * 100);
}

export function average(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function inverseScore(value) { const score = scoreToIndex(value); return score === null ? null : 100 - score; }
function roundedAverage(values) { const value = average(values.filter((item) => item !== null)); return value === null ? null : Math.round(value); }

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
  return {
    mood: roundedAverage([scoreToIndex(entry.mood), scoreToIndex(entry.calm), inverseScore(entry.anxiety), inverseScore(entry.irritation), scoreToIndex(entry.interest)]),
    energy: roundedAverage([scoreToIndex(entry.energyMorning), scoreToIndex(entry.energyDay), scoreToIndex(entry.energyEvening), scoreToIndex(entry.recovery), scoreToIndex(entry.sleepQuality)]),
    work: roundedAverage([scoreToIndex(entry.focus), scoreToIndex(entry.starting), scoreToIndex(entry.completion), scoreToIndex(entry.creativity), scoreToIndex(entry.social)]),
    body: roundedAverage([scoreToIndex(entry.body), inverseScore(entry.pain), scoreToIndex(entry.appetite), scoreToIndex(entry.digestion)])
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
  if (entry.resourceNote) lines.push("", `Дало ресурс: ${entry.resourceNote}`);
  if (entry.drainNote) lines.push(`Забрало ресурс: ${entry.drainNote}`);
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
  return `\ufeff${CSV_FIELDS.join(",")}\n${entries.map((entry) => CSV_FIELDS.map((field) => csvCell(entry[field])).join(",")).join("\n")}`;
}

function pearson(pairs) {
  if (pairs.length < 5) return null;
  const xs = pairs.map(([x]) => x), ys = pairs.map(([, y]) => y), mx = average(xs), my = average(ys);
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0) * ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
  return denominator ? numerator / denominator : null;
}

function targetScore(entry) { return average([scoreToIndex(entry.dayScore), ...Object.values(getIndices(entry))]); }

function groupedAverages(entries, keyFor) {
  const groups = new Map();
  entries.forEach((entry) => { const key = keyFor(entry), score = targetScore(entry); if (key !== null && Number.isFinite(score)) groups.set(key, [...(groups.get(key) || []), score]); });
  return [...groups].map(([key, values]) => ({ key, value: Math.round(average(values)), count: values.length }));
}

function factorAnalysis(entries) {
  const baseline = average(entries.map(targetScore).filter(Number.isFinite)), groups = new Map();
  entries.forEach((entry) => {
    const score = targetScore(entry);
    [...(entry.positiveFactors || []), ...(entry.factors || [])].forEach((factor) => groups.set(factor, [...(groups.get(factor) || []), score]));
    (entry.negativeFactors || []).forEach((factor) => groups.set(factor, [...(groups.get(factor) || []), score]));
  });
  return [...groups].map(([factor, scores]) => ({ factor, count: scores.length, delta: Math.round(average(scores) - baseline), average: Math.round(average(scores)) })).filter((item) => item.count >= 2).sort((a, b) => b.delta - a.delta);
}

function precursorAnalysis(entries) {
  const pairs = [];
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1], current = entries[index], gap = (new Date(`${current.date}T12:00:00`) - new Date(`${previous.date}T12:00:00`)) / 86400000;
    if (gap === 1) pairs.push([previous, targetScore(current)]);
  }
  return [["sleepHours","часы сна"],["sleepQuality","качество сна"],["load","нагрузка"],["energyEvening","вечерняя энергия"],["anxiety","тревога"]].map(([key,label]) => ({ key, label, correlation: pearson(pairs.map(([entry,next]) => [Number(entry[key]),next]).filter(([value,next]) => Number.isFinite(value) && Number.isFinite(next))) })).filter((item) => item.correlation !== null).sort((a,b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

function estimateCycle(entries) {
  if (entries.length < 21) return null;
  const scores = new Map(entries.map((entry) => [entry.date,targetScore(entry)])), dates = [...scores.keys()].sort(), results = [];
  for (let lag = 2; lag <= Math.min(45, Math.floor(entries.length / 2)); lag += 1) {
    const pairs = [];
    dates.forEach((date) => { const past = new Date(`${date}T12:00:00`); past.setDate(past.getDate() - lag); const prior = scores.get(past.toISOString().slice(0,10)); if (Number.isFinite(prior)) pairs.push([prior,scores.get(date)]); });
    const correlation = pearson(pairs); if (correlation !== null) results.push({ days:lag, correlation, samples:pairs.length });
  }
  const best = results.sort((a,b) => b.correlation - a.correlation)[0];
  return best && best.correlation >= .35 ? best : null;
}

export function analyzeEntries(entries, periodDays, today = new Date()) {
  const selected = filterByDays(entries, periodDays, today).sort((a,b) => a.date.localeCompare(b.date)), weekdayLabels = ["вс","пн","вт","ср","чт","пт","сб"];
  const weekdayRows = groupedAverages(selected, (entry) => new Date(`${entry.date}T12:00:00`).getDay()).map((item) => ({...item,label:weekdayLabels[item.key]})).filter((item) => item.count >= 2);
  const rankedWeekdays = [...weekdayRows].sort((a,b) => b.value - a.value);
  const months = groupedAverages(selected, (entry) => entry.date.slice(0,7)).map((item) => ({...item,label:new Intl.DateTimeFormat("ru-RU",{month:"short"}).format(new Date(`${item.key}-15T12:00:00`))}));
  const correlations = [["sleepHours","часы сна"],["sleepQuality","качество сна"],["load","нагрузка"],["cycleDay","день цикла"]].map(([key,label]) => ({key,label,correlation:pearson(selected.map((entry) => [Number(entry[key]),targetScore(entry)]).filter(([value,score]) => Number.isFinite(value) && Number.isFinite(score)))})).filter((item) => item.correlation !== null).sort((a,b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const firstDate = selected[0]?.date, elapsed = firstDate ? Math.round((today - new Date(`${firstDate}T00:00:00`)) / 86400000) + 1 : 0, expected = Math.min(periodDays, Math.max(0,elapsed));
  return { selected, coverage:{completed:selected.length,expected,percent:expected ? Math.round(selected.length / expected * 100) : 0}, weekdays:{rows:rankedWeekdays,best:rankedWeekdays[0] || null,hardest:rankedWeekdays.at(-1) || null}, months, correlations, factorEffects:factorAnalysis(selected), precursors:precursorAnalysis(selected), cycle:estimateCycle(selected) };
}

export function filterByDays(entries, days, today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return entries.filter((entry) => new Date(`${entry.date}T00:00:00`) >= cutoff);
}
