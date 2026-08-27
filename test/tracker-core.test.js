import test from "node:test";
import assert from "node:assert/strict";
import { entriesToCsv, escapeHtml, filterByDays, formatShareText, getIndices, scoreToIndex, upsertEntry } from "../tracker-core.js";

test("scoreToIndex maps the full scale to 0-100", () => {
  assert.equal(scoreToIndex(1), 0);
  assert.equal(scoreToIndex(3), 50);
  assert.equal(scoreToIndex(5), 100);
  assert.equal(scoreToIndex(0), null);
});

test("getIndices averages energy and work metrics", () => {
  const indices = getIndices({ mood: 5, calm: 3, energyMorning: 1, energyDay: 3, energyEvening: 5, recovery: 3, focus: 2, starting: 4, body: 5 });
  assert.deepEqual(indices, { mood: 75, energy: 50, work: 50, body: 100 });
});

test("upsertEntry replaces an existing date and keeps chronological order", () => {
  const result = upsertEntry([{ date: "2026-08-27", mood: 2 }, { date: "2026-08-25", mood: 3 }], { date: "2026-08-27", mood: 5 });
  assert.deepEqual(result, [{ date: "2026-08-25", mood: 3 }, { date: "2026-08-27", mood: 5 }]);
});

test("CSV escapes quotes and serializes factors", () => {
  const csv = entriesToCsv([{ date: "2026-08-27", factors: ["свет", "сон"], note: 'день "вверх"' }]);
  assert.match(csv, /"\u0441\u0432\u0435\u0442\|\u0441\u043e\u043d"/u);
  assert.match(csv, /"\u0434\u0435\u043d\u044c ""\u0432\u0432\u0435\u0440\u0445"""/u);
});

test("filterByDays includes the cutoff date", () => {
  const entries = [{ date: "2026-08-20" }, { date: "2026-08-21" }, { date: "2026-08-27" }];
  assert.deepEqual(filterByDays(entries, 7, new Date("2026-08-27T12:00:00")).map((entry) => entry.date), ["2026-08-21", "2026-08-27"]);
});

test("escapeHtml neutralizes markup restored from a backup", () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("formatShareText includes indices and optional writing", () => {
  const text = formatShareText({ date: "2026-08-27", dayScore: 4, mood: 5, calm: 3, energyMorning: 1, energyDay: 3, energyEvening: 5, recovery: 3, focus: 2, starting: 4, body: 5, note: "Дала ресурс прогулка", journal: "Хочу запомнить этот день" });
  assert.match(text, /27 августа 2026/u);
  assert.match(text, /Энергия: 50/u);
  assert.match(text, /Запись:\nХочу запомнить/u);
});

test("formatShareText remains useful for an old entry without notes", () => {
  const text = formatShareText({ date: "2026-08-27", dayScore: 3, mood: 3, calm: 3, energyMorning: 3, energyDay: 3, energyEvening: 3, recovery: 3, focus: 3, starting: 3, body: 3 });
  assert.doesNotMatch(text, /Запись:/u);
  assert.match(text, /Оценка дня: 3\/5/u);
});
