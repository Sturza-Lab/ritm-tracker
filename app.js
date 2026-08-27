import { STORAGE_KEY, analyzeEntries, average, entriesToCsv, escapeHtml, filterByDays, formatShareText, getIndices, upsertEntry } from "./tracker-core.js?v=6";

const positiveFactors = ["полноценный сон", "движение", "прогулка", "дневной свет", "тишина", "творчество", "приятное общение", "время наедине", "порядок", "природа"];
const negativeFactors = ["недосып", "конфликт", "стресс", "перегруз", "болезнь", "поездка", "алкоголь", "инфошум", "много общения", "неопределённость"];
const form = document.querySelector("#checkinForm");
const dateInput = document.querySelector("#entryDate");
let entries = loadEntries();
let period = 30;

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function prettyDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2200);
}

function setDate(date) {
  dateInput.value = date;
  document.querySelector("#prettyDate").textContent = prettyDate(date);
  loadEntry(date);
}

function loadEntry(date) {
  form.reset();
  form.querySelectorAll('input[type="range"]').forEach((input) => { input.value = 3; updateOutput(input); });
  const entry = entries.find((item) => item.date === date);
  document.querySelector("#saveLabel").textContent = entry ? "Обновить день" : "Сохранить день";
  if (!entry) return;
  Object.entries(entry).forEach(([key, value]) => {
    if (["factors", "positiveFactors", "negativeFactors"].includes(key)) {
      const prefix = key === "negativeFactors" ? "negative" : "positive";
      value.forEach((factor) => { const input = form.querySelector(`[name="${prefix}-${CSS.escape(factor)}"]`); if (input) input.checked = true; });
      return;
    }
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof RadioNodeList) field.value = String(value);
    else if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  });
  form.querySelectorAll('input[type="range"]').forEach(updateOutput);
}

function updateOutput(input) {
  const container = input.closest(".metric") || input.closest("label");
  const output = container?.querySelector("output");
  if (output) output.textContent = input.value;
  const progress = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty("--progress", `${progress}%`);
}

function formEntry() {
  const data = new FormData(form);
  const numericFields = ["dayScore", "mood", "calm", "anxiety", "irritation", "interest", "energyMorning", "energyDay", "energyEvening", "recovery", "sleepHours", "sleepQuality", "focus", "starting", "completion", "creativity", "social", "body", "pain", "appetite", "digestion", "load", "cycleDay"];
  const textFields = ["dayType", "resourceNote", "drainNote", "note", "journal"];
  const entry = { date: dateInput.value, positiveFactors: positiveFactors.filter((factor) => data.has(`positive-${factor}`)), negativeFactors: negativeFactors.filter((factor) => data.has(`negative-${factor}`)), illness: data.has("illness"), updatedAt: new Date().toISOString() };
  numericFields.forEach((field) => { const value = data.get(field); entry[field] = value === "" || value === null ? null : Number(value); });
  textFields.forEach((field) => { entry[field] = String(data.get(field) || "").trim(); });
  return entry;
}

function navigate(target) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === target));
  document.querySelectorAll(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.target === target));
  if (target === "history") renderHistory();
  if (target === "trends") renderTrends();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHistory() {
  const list = document.querySelector("#historyList");
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  document.querySelector("#historySummary").textContent = sorted.length ? `${sorted.length} ${plural(sorted.length, "день", "дня", "дней")} сохранено` : "Первый день ещё не записан";
  list.innerHTML = sorted.length ? sorted.map((entry) => {
    const indices = getIndices(entry);
    return `<article class="history-item"><span class="history-date"><b>${new Date(`${entry.date}T12:00:00`).getDate()}</b><small>${new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(`${entry.date}T12:00:00`))}</small></span><button class="history-main" data-edit-date="${escapeHtml(entry.date)}"><b>${escapeHtml(entry.note || entry.journal || dayLabel(entry.dayScore))}</b><small>энергия ${indices.energy} · настроение ${indices.mood}</small></button><button class="share-entry" data-share-date="${escapeHtml(entry.date)}" aria-label="Поделиться записью за ${escapeHtml(entry.date)}">↗</button></article>`;
  }).join("") : `<div class="empty">Здесь появится лента ваших дней</div>`;
}

function renderTrends() {
  const selected = filterByDays(entries, period);
  const analysis = analyzeEntries(entries, period);
  const stats = selected.map(getIndices);
  const mean = (key) => Math.round(average(stats.map((item) => item[key]))) || 0;
  const completed = selected.length;
  document.querySelector("#insightCard").innerHTML = completed < 3 ? `<span>Первый ориентир</span><strong>Нужно ещё ${Math.max(0, 3 - completed)} ${plural(3 - completed, "запись", "записи", "записей")}</strong><p>После трёх дней здесь появится первый рисунок</p>` : `<span>За ${period} дней</span><strong>${trendSentence(selected)}</strong><p>Заполнено ${completed} ${plural(completed, "день", "дня", "дней")}</p>`;
  document.querySelector("#statsGrid").innerHTML = [["Энергия", mean("energy")], ["Настроение", mean("mood")], ["В деле", mean("work")], ["Тело", mean("body")]].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong><div><i style="width:${value}%"></i></div></article>`).join("");
  renderChart(selected);
  renderAnalysis(analysis);
}

function relationText(item, prefix = "") {
  const strength = Math.abs(item.correlation);
  const direction = item.correlation > 0 ? "связано с более высоким состоянием" : "связано с более низким состоянием";
  return strength < 0.3 ? null : `${prefix}${item.label}: ${direction}`;
}

function renderAnalysis(analysis) {
  document.querySelector("#coverageBadge").textContent = `заполнено ${analysis.coverage.percent}%`;
  const patterns = [];
  if (analysis.weekdays.best && analysis.weekdays.hardest && analysis.weekdays.best.label !== analysis.weekdays.hardest.label) patterns.push(`<b>Ритм недели</b><span>Чаще легче в ${analysis.weekdays.best.label}, сложнее в ${analysis.weekdays.hardest.label}</span>`);
  const correlation = analysis.correlations.find((item) => Math.abs(item.correlation) >= .3);
  if (correlation) patterns.push(`<b>Связь в тот же день</b><span>${relationText(correlation)}</span>`);
  const positive = analysis.factorEffects.find((item) => item.delta >= 5), negative = [...analysis.factorEffects].reverse().find((item) => item.delta <= -5);
  if (positive) patterns.push(`<b>Поддерживает</b><span>В дни с «${escapeHtml(positive.factor)}» общий индекс выше примерно на ${positive.delta} пунктов</span>`);
  if (negative) patterns.push(`<b>Истощает</b><span>В дни с «${escapeHtml(negative.factor)}» общий индекс ниже примерно на ${Math.abs(negative.delta)} пунктов</span>`);
  const precursor = analysis.precursors.find((item) => Math.abs(item.correlation) >= .3);
  if (precursor) patterns.push(`<b>Возможный предвестник</b><span>${relationText(precursor, "Накануне ")}</span>`);
  if (analysis.cycle) patterns.push(`<b>Повторяемость</b><span>Похожий рисунок состояния повторяется примерно через ${analysis.cycle.days} дней. Это наблюдение, не прогноз</span>`);
  if (!patterns.length) patterns.push(`<b>Пока собираю рисунок</b><span>Для устойчивых связей нужно минимум 5 сопоставимых записей, для цикла - 21 день</span>`);
  document.querySelector("#patternsList").innerHTML = patterns.map((item) => `<article>${item}</article>`).join("");
  document.querySelector("#monthRhythm").innerHTML = analysis.months.length ? analysis.months.map((month) => `<div><span>${escapeHtml(month.label)}</span><i><b style="width:${month.value}%"></b></i><strong>${month.value}</strong></div>`).join("") : `<div class="empty-chart">Месячный ритм появится с записями</div>`;
}

function renderChart(selected) {
  const chart = document.querySelector("#trendChart");
  if (selected.length < 2) { chart.innerHTML = `<div class="empty-chart">График появится после двух записей</div>`; return; }
  const width = 600, height = 190, pad = 12;
  const points = (key) => selected.map((entry, index) => { const value = getIndices(entry)[key]; return `${pad + index * ((width - pad * 2) / (selected.length - 1))},${height - pad - value * ((height - pad * 2) / 100)}`; }).join(" ");
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График настроения и энергии"><line x1="0" y1="95" x2="600" y2="95"/><polyline class="line mood-line" points="${points("mood")}"/><polyline class="line energy-line" points="${points("energy")}"/></svg>`;
}

function trendSentence(selected) {
  const recent = selected.slice(-3).map((entry) => getIndices(entry).energy);
  const earlier = selected.slice(-6, -3).map((entry) => getIndices(entry).energy);
  if (!earlier.length) return "Вы собираете свой первый цикл";
  const delta = average(recent) - average(earlier);
  if (delta > 8) return "Энергия сейчас идёт вверх";
  if (delta < -8) return "Энергия сейчас снижается";
  return "Энергия сейчас держится ровно";
}

function dayLabel(score) { return ["", "Тяжёлый день", "Ниже обычного", "Ровный день", "Хороший день", "День подъёма"][score]; }
function plural(number, one, few, many) { const n = Math.abs(number) % 100, n1 = n % 10; return n > 10 && n < 20 ? many : n1 > 1 && n1 < 5 ? few : n1 === 1 ? one : many; }
function download(name, content, type) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }

async function shareEntry(entry) {
  const text = formatShareText(entry);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Ритм · ${entry.date}`, text });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Запись скопирована");
  } catch {
    toast("Не удалось открыть отправку");
  }
}

document.querySelector("#positiveFactorChips").innerHTML = positiveFactors.map((factor) => `<label><input type="checkbox" name="positive-${factor}"><span>${factor}</span></label>`).join("");
document.querySelector("#negativeFactorChips").innerHTML = negativeFactors.map((factor) => `<label><input type="checkbox" name="negative-${factor}"><span>${factor}</span></label>`).join("");
dateInput.addEventListener("change", () => setDate(dateInput.value));
document.querySelectorAll("[data-date-step]").forEach((button) => button.addEventListener("click", () => { const date = new Date(`${dateInput.value}T12:00:00`); date.setDate(date.getDate() + Number(button.dataset.dateStep)); setDate(date.toISOString().slice(0, 10)); }));
form.addEventListener("input", (event) => { if (event.target.matches('input[type="range"]')) updateOutput(event.target); });
form.addEventListener("submit", (event) => { event.preventDefault(); entries = upsertEntry(entries, formEntry()); saveEntries(); document.querySelector("#saveLabel").textContent = "Обновить день"; toast("День сохранён"); });
document.querySelectorAll(".bottom-nav button").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.target)));
document.querySelector("#historyList").addEventListener("click", (event) => {
  const shareButton = event.target.closest("[data-share-date]");
  if (shareButton) { const entry = entries.find((item) => item.date === shareButton.dataset.shareDate); if (entry) shareEntry(entry); return; }
  const item = event.target.closest("[data-edit-date]");
  if (item) { setDate(item.dataset.editDate); navigate("checkin"); }
});
document.querySelector("#periodTabs").addEventListener("click", (event) => { const button = event.target.closest("button"); if (!button) return; period = Number(button.dataset.period); document.querySelectorAll("#periodTabs button").forEach((item) => item.classList.toggle("active", item === button)); renderTrends(); });
document.querySelector("#exportCsv").addEventListener("click", () => entries.length ? download("ritm-export.csv", entriesToCsv(entries), "text/csv;charset=utf-8") : toast("Пока нет данных"));
document.querySelector("#backupJson").addEventListener("click", () => entries.length ? download("ritm-backup.json", JSON.stringify(entries, null, 2), "application/json") : toast("Пока нет данных"));
document.querySelector("#restoreJson").addEventListener("change", async (event) => { try { const parsed = JSON.parse(await event.target.files[0].text()); if (!Array.isArray(parsed) || parsed.some((item) => !item.date)) throw new Error(); entries = parsed; saveEntries(); renderTrends(); toast("Копия восстановлена"); } catch { toast("Этот файл не подходит"); } });

let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; document.querySelector("#installButton").hidden = false; });
document.querySelector("#installButton").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; document.querySelector("#installButton").hidden = true; });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
setDate(todayIso());
