// Pure helpers, shared by the page and by test.js.

// Accepts "2", "1.5", "1,5", "1:30", "90m", "2h", "1h30", "1h 30m". Returns hours or null.
export function parseDuration(text) {
  const s = String(text).trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) return +m[1] + +m[2] / 60;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/))) return +m[1] / 60;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h?(?:\s*(\d+)\s*m?)?$/))) {
    const h = +m[1] + (m[2] ? +m[2] / 60 : 0);
    return h > 0 && h <= 24 ? h : null;
  }
  return null;
}

// 1.5 -> "1:30", 8 -> "8:00"
export function fmtHours(h) {
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fromIso = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Monday of the week that holds d.
export const weekStart = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));

// Weeks (arrays of 7 dates, Monday first) that cover the month of d.
export function monthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const weeks = [];
  for (let w = weekStart(first); w <= last; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }
  return weeks;
}

// Hours per client for entries with from <= date < to (ISO strings). Sorted, largest first.
export function totals(entries, from, to) {
  const by = new Map();
  for (const e of entries) {
    if (e.date >= from && e.date < to) by.set(e.clientId, (by.get(e.clientId) || 0) + e.hours);
  }
  const rows = [...by].map(([clientId, hours]) => ({ clientId, hours })).sort((a, b) => b.hours - a.hours);
  return { sum: rows.reduce((a, r) => a + r.hours, 0), rows };
}

// Percent of located hours that were remote, for entries with from <= date < to. Null when nothing has a location.
export function remoteShare(entries, from, to) {
  let remote = 0;
  let all = 0;
  for (const e of entries) {
    if (e.date < from || e.date >= to || !e.location) continue;
    all += e.hours;
    if (e.location === "remote") remote += e.hours;
  }
  return all ? Math.round((remote / all) * 100) : null;
}

// Hours x rate, summed per currency. Clients without a rate earn nothing.
export function earnings(rows, clients) {
  const out = {};
  for (const r of rows) {
    const c = clients.find((c) => c.id === r.clientId);
    if (c?.rate) out[c.currency] = (out[c.currency] || 0) + r.hours * c.rate;
  }
  return out;
}

// "09:00", "11:30" -> 2.5. Null when the end is not after the start.
export function durationFromTimes(start, end) {
  const mins = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const d = mins(end) - mins(start);
  return d > 0 ? d / 60 : null;
}

// Distinct Monday-to-Friday dates with a Holiday leave entry, for from <= date < to.
export function holidayWorkdays(entries, from, to) {
  const days = new Set();
  for (const e of entries) {
    if (e.leaveType === "holiday" && e.date >= from && e.date < to && fromIso(e.date).getDay() % 6) days.add(e.date);
  }
  return days.size;
}

// Mondays to Fridays of the week that starts on ws and that fall in the month of d.
export function weekWorkdaysInMonth(ws, d) {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    const x = addDays(ws, i);
    if (x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear()) n++;
  }
  return n;
}

export function weekdaysInMonth(d) {
  let n = 0;
  for (let x = new Date(d.getFullYear(), d.getMonth(), 1); x.getMonth() === d.getMonth(); x = addDays(x, 1)) {
    if (x.getDay() % 6) n++;
  }
  return n;
}
