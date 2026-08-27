import { STORAGE_KEY, average, entriesToCsv, escapeHtml, filterByDays, formatShareText, getIndices, upsertEntry } from "./tracker-core.js";

const factors = ["движение", "прогулка", "дневной свет", "тишина", "приятное общение", "конфликт", "стресс", "перегруз", "болезнь", "поездка", "алкоголь", "важное событие"];
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
    if (key === "factors") {
      value.forEach((factor) => { const input = form.querySelector(`[name="factor-${CSS.escape(factor)}"]`); if (input) input.checked = true; });
      return;
    }
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof RadioNodeList) field.value = String(value);
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
  const numericFields = ["dayScore", "mood", "calm", "energyMorning", "energyDay", "energyEvening", "recovery", "focus", "starting", "body", "load"];
  const entry = { date: dateInput.value, factors: factors.filter((factor) => data.has(`factor-${factor}`)), note: data.get("note").trim(), journal: data.get("journal").trim(), updatedAt: new Date().toISOString() };
  numericFields.forEach((field) => { entry[field] = Number(data.get(field)); });
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
  const stats = selected.map(getIndices);
  const mean = (key) => Math.round(average(stats.map((item) => item[key]))) || 0;
  const completed = selected.length;
  document.querySelector("#insightCard").innerHTML = completed < 3 ? `<span>Первый ориентир</span><strong>Нужно ещё ${Math.max(0, 3 - completed)} ${plural(3 - completed, "запись", "записи", "записей")}</strong><p>После трёх дней здесь появится первый рисунок</p>` : `<span>За ${period} дней</span><strong>${trendSentence(selected)}</strong><p>Заполнено ${completed} ${plural(completed, "день", "дня", "дней")}</p>`;
  document.querySelector("#statsGrid").innerHTML = [["Энергия", mean("energy")], ["Настроение", mean("mood")], ["В деле", mean("work")], ["Тело", mean("body")]].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong><div><i style="width:${value}%"></i></div></article>`).join("");
  renderChart(selected);
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

document.querySelector("#factorChips").innerHTML = factors.map((factor) => `<label><input type="checkbox" name="factor-${factor}"><span>${factor}</span></label>`).join("");
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
