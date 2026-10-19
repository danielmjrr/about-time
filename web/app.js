import {
  parseDuration, fmtHours, iso, fromIso, addDays, weekStart, monthGrid,
  totals, earnings, durationFromTimes, weekdaysInMonth, weekWorkdaysInMonth, remoteShare, holidayWorkdays,
} from "./lib.js";

const PRESETS = ["#2F6FED", "#12A594", "#7C5CFF", "#E5A00D", "#D6457A", "#3AA55A", "#0EA5E9", "#F06B2C", "#9A6B3F", "#64748B"];
const CURRENCIES = ["AUD", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HUF", "INR", "JPY", "NOK", "NZD", "PLN", "SEK", "USD"];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (d, opts) => new Intl.DateTimeFormat(undefined, opts).format(d);
const money = (n, cur) => new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
// Leave is stored as an entry with this pseudo client. It never counts toward work totals or targets.
const LEAVE = { id: "leave", name: "On Leave", color: "#8a93a6" };
const isWork = (e) => e.clientId !== LEAVE.id;
const isHoliday = (e) => e.leaveType === "holiday"; // a whole day off, shown and counted with no hours
const client = (id) => (id === LEAVE.id ? LEAVE : db.clients.find((c) => c.id === id) || { name: "Deleted client", color: "#8a8f98" });

// Optional entry fields. Entries saved before these existed have none of them and still work.
const KINDS = [["work", "Work"], ["meeting", "Meeting"]];
const LOCATIONS = [["remote", "Remote"], ["office", "In-Office"]];
const LEAVE_TYPES = [["sick", "Sick"], ["holiday", "Holiday"], ["vacation", "Vacation"], ["other", "Other"]];
const QUICK = [[0.5, "30m"], [1, "1h"], [2, "2h"], [4, "4h"], [8, "8h"]];
const labelOf = (list, v) => list.find((x) => x[0] === v)?.[1];
const entryName = (e) => (isWork(e) ? client(e.clientId).name : labelOf(LEAVE_TYPES, e.leaveType) || LEAVE.name);

const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  remote: svg('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>'),
  office: svg('<path d="M4.5 21V4.5A1.5 1.5 0 0 1 6 3h7.5A1.5 1.5 0 0 1 15 4.5V21"/><path d="M15 9h3a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19M8 7h3.5M8 11h3.5M8 15h3.5"/>'),
  work: svg('<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>'),
  meeting: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.1a4.5 4.5 0 0 1 5 4.4"/>'),
  sick: svg('<path d="M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0Z"/><path d="M12 11v6"/>'),
  holiday: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  vacation: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>'),
  other: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
};

let db = { clients: [], entries: [], settings: {} };
let view = new Date(); // any date in the month on screen
let drawer = null; // { kind: "day", date } or { kind: "clients" }
let form = freshForm();
let openPalette = null;
let lastDeleted = null;
let returnFocus = null;

function freshForm() {
  return { editId: null, clientId: null, kind: "", location: "", leaveType: "", hours: "", start: "", end: "", note: "", showTimes: false };
}

const hoursPerDay = () => db.settings.hoursPerDay || 8;
const manDays = (h) => Math.round((h / hoursPerDay()) * 10) / 10;
// Target = one man-day for every workday. Every Monday to Friday is a workday.
// The week counts only its workdays that fall in the current month.
const weekTarget = (ws) => weekWorkdaysInMonth(ws, new Date()) * hoursPerDay();
// A Holiday (state holiday) on a workday removes that day from the month.
const monthHolidays = (d) => holidayWorkdays(db.entries, iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
const monthTarget = (d) => (weekdaysInMonth(d) - monthHolidays(d)) * hoursPerDay();

// ---- persistence ----

let saving = Promise.resolve();
function persist() {
  const body = JSON.stringify(db);
  saving = saving
    .then(() => fetch("/api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body }))
    .then((r) => { if (!r.ok) throw new Error(r.status); })
    .catch(() => toast("Could not save. Click the About Time icon in the Dock, then try again."));
}

// ---- rendering ----

function render() {
  renderTotals();
  renderGrid();
  if (drawer) renderDrawer();
}

function renderTotals() {
  const el = $("#totals");
  if (!db.clients.length) {
    el.innerHTML = `<div class="empty">
      <h2>Start with your clients</h2>
      <p>Add the clients you work for. Then click a day in the calendar to log time.</p>
      <button class="btn primary" data-act="openClients">Add clients</button></div>`;
    return;
  }
  const now = new Date();
  const ws = weekStart(now);
  const ms = new Date(view.getFullYear(), view.getMonth(), 1);
  const isThisMonth = ms.getMonth() === now.getMonth() && ms.getFullYear() === now.getFullYear();
  el.innerHTML =
    period("This week", `${fmtDate(ws, { day: "numeric", month: "short" })} – ${fmtDate(addDays(ws, 6), { day: "numeric", month: "short" })}, ${weekWorkdaysInMonth(ws, now)} workdays`, ws, addDays(ws, 7), weekTarget(ws), "week") +
    period(isThisMonth ? "This month" : fmtDate(ms, { month: "long", year: "numeric" }), `${weekdaysInMonth(ms) - monthHolidays(ms)} workdays${monthHolidays(ms) ? `, ${monthHolidays(ms)} holiday${monthHolidays(ms) > 1 ? "s" : ""}` : ""}`, ms, new Date(ms.getFullYear(), ms.getMonth() + 1, 1), monthTarget(ms), "month");
}

function period(title, sub, from, to, target, noun) {
  const t = totals(db.entries.filter(isWork), iso(from), iso(to));
  const leave = totals(db.entries.filter((e) => !isWork(e) && !isHoliday(e)), iso(from), iso(to)).sum;
  const remote = remoteShare(db.entries.filter(isWork), iso(from), iso(to));
  const earn = Object.entries(earnings(t.rows, db.clients));
  const scale = Math.max(target, t.sum) || 1;
  const amount = (r) => {
    const c = client(r.clientId);
    return c.rate ? money(r.hours * c.rate, c.currency) : "";
  };
  const stat = (value, label) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  const legend = [...t.rows, ...(leave ? [{ clientId: LEAVE.id, hours: leave }] : [])];
  return `<article class="period"><div class="p-in">
    <header class="p-head"><h2>${title}</h2><span class="range">${sub}</span></header>
    <p class="figure"><span class="big">${fmtHours(t.sum)}</span>${target ? `<span class="of">of ${fmtHours(target)}</span>` : ""}</p>
    <div class="stats">
      ${earn.length ? stat(earn.map(([cur, n]) => money(n, cur)).join(" + "), "earned") : ""}
      ${stat(manDays(t.sum).toLocaleString(), manDays(t.sum) === 1 ? "man-day" : "man-days")}
      ${remote != null ? stat(`${remote}%`, "remote") : ""}
    </div>
    <div class="strip" role="img" aria-label="${fmtHours(t.sum)} logged${target ? ` of a ${fmtHours(target)} target` : ""}">
      <div class="fill">${t.rows.map((r) => `<span style="--c:${client(r.clientId).color};width:${(r.hours / scale) * 100}%"></span>`).join("")}</div>
      ${target ? `<span class="tick" style="left:${(target / scale) * 100}%"></span>` : ""}
    </div>
    ${legend.length
      ? `<ul class="legend">${legend.map((r) => `<li class="${r.clientId === LEAVE.id ? "leave" : ""}" style="--c:${client(r.clientId).color}">
          <span class="dot"></span>${esc(client(r.clientId).name)} <b>${fmtHours(r.hours)}</b>${amount(r) ? `<span class="amt">${amount(r)}</span>` : ""}</li>`).join("")}</ul>`
      : `<p class="hint legend">No time logged this ${noun}.</p>`}
  </div></article>`;
}

function renderGrid() {
  $("#monthTitle").textContent = fmtDate(view, { month: "long", year: "numeric" });
  const today = iso(new Date());
  const byDay = new Map();
  for (const e of db.entries) (byDay.get(e.date) || byDay.set(e.date, []).get(e.date)).push(e);

  const mon = weekStart(new Date());
  let html = Array.from({ length: 7 }, (_, i) => `<div class="wd">${fmtDate(addDays(mon, i), { weekday: "short" })}</div>`).join("");
  html += `<div class="wd wkh">Week</div>`;

  for (const week of monthGrid(view)) {
    let weekSum = 0;
    for (const d of week) {
      const key = iso(d);
      const list = byDay.get(key) || [];
      const sum = list.filter(isWork).reduce((a, e) => a + e.hours, 0);
      weekSum += sum;
      // One pill per client and location, and one per leave type. Leave goes last.
      const per = new Map();
      for (const e of list) {
        const k = isWork(e) ? `${e.clientId}|${e.location || ""}` : `leave:${e.leaveType || ""}`;
        const icon = ICONS[isWork(e) ? e.location : e.leaveType];
        const p = per.get(k) || per.set(k, { name: entryName(e), color: client(e.clientId).color, leave: !isWork(e), holiday: isHoliday(e), icon, hours: 0 }).get(k);
        p.hours += e.hours;
      }
      const pills = [...per.values()].sort((a, b) => a.leave - b.leave || b.hours - a.hours);
      const cls = ["day", d.getMonth() !== view.getMonth() && "out", d.getDay() % 6 === 0 && "weekend", key === today && "today"].filter(Boolean).join(" ");
      const label = `${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}, ${sum ? `${fmtHours(sum)} logged` : "nothing logged"}`;
      html += `<button class="${cls}" data-date="${key}" aria-label="${label}">
        <span class="day-top"><span class="num">${d.getDate()}</span>${sum ? `<span class="sum">${fmtHours(sum)}</span>` : ""}</span>
        <span class="pills">${pills.map((p) => `<span class="pill ${p.leave ? "leave" : ""}" style="--c:${p.color}" title="${esc(p.name)}${p.holiday ? "" : ` ${fmtHours(p.hours)}`}">${p.icon || "<i></i>"}<span class="name">${esc(p.name)}</span>${p.holiday ? "" : `<b>${fmtHours(p.hours)}</b>`}</span>`).join("")}
        <span class="more" hidden></span></span>
      </button>`;
    }
    html += weekCell(week, weekSum, byDay);
  }
  $("#grid").innerHTML = html;
  $("#grid").style.setProperty("--weeks", monthGrid(view).length);
  fitPills();
}

// Week column: hours, target, man-days, earnings and remote share for the week.
// The target counts the workdays of this week that fall in the month on screen.
function weekCell(week, sum, byDay) {
  const target = weekWorkdaysInMonth(week[0], view) * hoursPerDay();
  const work = week.flatMap((d) => (byDay.get(iso(d)) || []).filter(isWork));
  const t = totals(work, iso(week[0]), iso(addDays(week[6], 1)));
  const earn = Object.entries(earnings(t.rows, db.clients));
  const remote = remoteShare(work, iso(week[0]), iso(addDays(week[6], 1)));
  return `<div class="wk ${sum ? "" : "wk-zero"}">
    <b>${fmtHours(sum)}</b>
    ${target ? `<span>of ${fmtHours(target)}</span>` : ""}
    <span>${manDays(sum).toLocaleString()} MD</span>
    ${earn.map(([cur, n]) => `<span>${money(n, cur)}</span>`).join("")}
    ${remote != null ? `<span>${remote}% remote</span>` : ""}
  </div>`;
}

// Day cells shrink with the window. First drop the client names (compact), then the hours (tiny),
// then hide the chips that still do not fit and show "+N more".
function fitPills() {
  for (const day of document.querySelectorAll(".day")) {
    const pills = [...day.querySelectorAll(".pill")];
    const more = day.querySelector(".more");
    pills.forEach((p) => (p.hidden = false));
    more.hidden = true;
    day.classList.remove("compact", "tiny");
    if (day.scrollHeight > day.clientHeight) day.classList.add("compact");
    if (day.scrollHeight > day.clientHeight) day.classList.add("tiny"); // icons only, no hours
    let shown = pills.length;
    while (shown && day.scrollHeight > day.clientHeight) {
      pills[--shown].hidden = true;
      more.textContent = `+${pills.length - shown} more`;
      more.hidden = false;
    }
  }
}
window.addEventListener("resize", fitPills);

function renderDrawer() {
  const el = $("#drawer");
  el.innerHTML = drawer.kind === "day" ? dayHtml(drawer.date) : clientsHtml();
}

function dayHtml(date) {
  const d = fromIso(date);
  const list = db.entries.filter((e) => e.date === date);
  const sum = list.filter(isWork).reduce((a, e) => a + e.hours, 0);
  const leave = list.filter((e) => !isWork(e) && !isHoliday(e)).reduce((a, e) => a + e.hours, 0);
  const choices = db.clients.filter((c) => !c.archived || c.id === form.clientId);
  const selected = form.clientId || (choices.length === 1 ? choices[0].id : null);
  const summary = [list.some(isHoliday) && "Holiday", sum && `${fmtHours(sum)} logged`, leave && `${fmtHours(leave)} on leave`].filter(Boolean).join(", ");

  const entry = (e) => {
    const c = client(e.clientId);
    const iconKey = isWork(e) ? e.location : e.leaveType;
    const where = isWork(e) ? labelOf(LOCATIONS, e.location) : "";
    const kind = isWork(e) && e.kind ? `<span class="kind" title="${labelOf(KINDS, e.kind)}">${ICONS[e.kind]}<span class="sr">${labelOf(KINDS, e.kind)}</span></span>` : "";
    return `<li><button class="entry ${form.editId === e.id ? "editing" : ""}" data-edit="${e.id}" style="--c:${c.color}">
        <span class="lead" ${where ? `title="${where}"` : ""}>${ICONS[iconKey] || `<span class="dot"></span>`}${where ? `<span class="sr">${where}</span>` : ""}</span>
        <span class="who">${esc(entryName(e))}${kind}</span>
        <span class="hrs">${isHoliday(e) ? "" : fmtHours(e.hours)}${e.start && !isHoliday(e) ? `<small>${e.start}–${e.end}</small>` : ""}</span>
        ${e.note ? `<span class="note">${esc(e.note)}</span>` : ""}</button>
      <button class="icon-btn del" data-del="${e.id}" aria-label="Delete ${esc(entryName(e))} ${fmtHours(e.hours)}">×</button></li>`;
  };

  const seg = (name, list, value, legend) => `<fieldset class="seg"><legend class="sr">${legend}</legend>
      ${list.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${v === value ? "checked" : ""}><span>${ICONS[v]}${l}</span></label>`).join("")}</fieldset>`;
  const leaveSelected = selected === LEAVE.id;

  const formHtml = `<form id="entryForm" novalidate>
      <h3>${form.editId ? "Edit time" : "Add time"}</h3>
      <fieldset class="chips"><legend class="sr">Client</legend>
        ${[...choices, LEAVE].map((c) => `<label class="chip ${c.id === LEAVE.id ? "leave" : ""}" style="--c:${c.color}"><input type="radio" name="client" value="${c.id}" ${c.id === selected ? "checked" : ""}><span>${esc(c.name)}</span></label>`).join("")}
      </fieldset>
      <div class="seg-row" id="workOpts" ${leaveSelected ? "hidden" : ""}>${seg("kind", KINDS, form.kind, "Type")}${seg("location", LOCATIONS, form.location, "Location")}</div>
      <div class="seg-row" id="leaveOpts" ${leaveSelected ? "" : "hidden"}>${seg("leaveType", LEAVE_TYPES, form.leaveType, "Leave type")}</div>
      <div id="timeBlock" ${leaveSelected && form.leaveType === "holiday" ? "hidden" : ""}>
        <div class="field">
          <label for="fHours">Hours</label>
          <div class="hours-row">
            <input id="fHours" inputmode="decimal" autocomplete="off" placeholder="2h, 1:30 or 90m" value="${esc(form.hours)}">
            <div class="quick">${QUICK.map(([h, l]) => `<button type="button" class="q" data-hours="${h}">${l}</button>`).join("")}</div>
          </div>
        </div>
        <button type="button" class="link" data-act="toggleTimes" aria-expanded="${form.showTimes}">${form.showTimes ? "Hide start and end time" : "Add start and end time"}</button>
        <div class="row2" id="times" ${form.showTimes ? "" : "hidden"}>
          <label class="field">Start<input type="time" id="fStart" value="${form.start}"></label>
          <label class="field">End<input type="time" id="fEnd" value="${form.end}"></label>
        </div>
      </div>
      <label class="field">Note<input id="fNote" autocomplete="off" placeholder="What did you work on?" value="${esc(form.note)}"></label>
      <p class="err" id="fErr" role="alert"></p>
      <div class="form-actions">
        <button class="btn primary">${form.editId ? "Save changes" : "Save"}</button>
        ${form.editId ? `<button type="button" class="btn" data-act="cancelEdit">Cancel</button>` : ""}
      </div>
    </form>`;

  return `<div class="d-head">
      <h2 id="drawerTitle">${fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}</h2>
      <button class="icon-btn" data-act="prevDay" aria-label="Previous day">‹</button>
      <button class="icon-btn" data-act="nextDay" aria-label="Next day">›</button>
      <button class="icon-btn" data-act="close" aria-label="Close">×</button>
    </div>
    <p class="d-sub">${summary || "Nothing logged yet"}</p>
    ${list.length ? `<ul class="entries">${list.map(entry).join("")}</ul>` : ""}
    ${db.clients.length ? formHtml : `<p class="hint">Add a client first, then log time for it.</p><p><button class="btn primary" data-act="openClients">Add clients</button></p>`}`;
}

function clientsHtml() {
  const used = new Set(db.entries.map((e) => e.clientId));
  const row = (c) => `<li class="client-row ${c.archived ? "archived" : ""}" data-id="${c.id}">
      <button type="button" class="swatch" style="--c:${c.color}" data-act="palette" aria-label="Change color for ${esc(c.name)}" aria-expanded="${openPalette === c.id}"></button>
      <input data-field="name" value="${esc(c.name)}" aria-label="Client name">
      <input data-field="rate" inputmode="decimal" value="${c.rate ?? ""}" placeholder="Rate" aria-label="Hourly rate for ${esc(c.name)}">
      <select data-field="currency" aria-label="Currency for ${esc(c.name)}">${CURRENCIES.map((x) => `<option ${x === c.currency ? "selected" : ""}>${x}</option>`).join("")}</select>
      ${used.has(c.id)
        ? `<button type="button" class="btn small" data-act="${c.archived ? "restore" : "archive"}">${c.archived ? "Restore" : "Archive"}</button>`
        : `<button type="button" class="btn small" data-act="deleteClient">Delete</button>`}
      ${openPalette === c.id ? `<div class="palette">
        ${PRESETS.map((p) => `<button type="button" data-color="${p}" style="--c:${p}" aria-label="Color ${p}" aria-pressed="${p === c.color}"></button>`).join("")}
        <label class="custom">Custom<input type="color" data-field="color" value="${c.color}"></label></div>` : ""}
    </li>`;
  const active = db.clients.filter((c) => !c.archived);
  const archived = db.clients.filter((c) => c.archived);
  return `<div class="d-head">
      <h2 id="drawerTitle">Settings</h2>
      <button class="icon-btn" data-act="close" aria-label="Close">×</button>
    </div>
    <h3>Clients</h3>
    <p class="d-sub">Click a color dot to change it. Rate is per hour.</p>
    ${active.length ? `<ul class="clients">${active.map(row).join("")}</ul>` : ""}
    <form id="addClient" class="add-client">
      <label class="sr" for="newClient">New client name</label>
      <input id="newClient" class="field-input" autocomplete="off" placeholder="New client name">
      <button class="btn primary">Add client</button>
    </form>
    ${archived.length ? `<h3>Archived</h3><p class="hint" style="margin-bottom:10px">Hidden when you log time. Their hours still count in totals.</p><ul class="clients">${archived.map(row).join("")}</ul>` : ""}
    <h3>Targets</h3>
    <div class="target field"><input id="hoursPerDay" inputmode="decimal" value="${hoursPerDay()}" aria-label="Hours in one man-day"><span>hours in one man-day</span></div>
    <p class="hint">The target is one man-day for each workday, Monday to Friday: ${fmtHours(monthTarget(view))} in ${fmtDate(view, { month: "long" })}.</p>`;
}

// ---- drawer ----

function openDrawer(next) {
  if (!drawer) returnFocus = document.activeElement;
  drawer = next;
  renderDrawer();
  $("#drawer").classList.add("open");
  $("#scrim").hidden = false;
}

function closeDrawer() {
  drawer = null;
  openPalette = null;
  $("#drawer").classList.remove("open");
  $("#scrim").hidden = true;
  returnFocus?.focus?.();
}

function openDay(date) {
  form = freshForm();
  view = fromIso(date);
  openDrawer({ kind: "day", date });
  renderTotals();
  renderGrid();
  focusForm();
}

function focusForm() {
  const picked = $("#entryForm input[name=client]:checked");
  (picked ? $("#fHours") : $("#entryForm input[name=client]"))?.focus();
}

// ---- actions ----

function saveEntry() {
  const err = (m) => { $("#fErr").textContent = m; };
  const clientId = $("#entryForm input[name=client]:checked")?.value;
  const useTimes = !$("#times").hidden;
  const start = useTimes ? $("#fStart").value : "";
  const end = useTimes ? $("#fEnd").value : "";
  let hours = parseDuration($("#fHours").value);
  const pick = (name) => $(`#entryForm input[name=${name}]:checked`)?.value;
  const extra = clientId === LEAVE.id ? { leaveType: pick("leaveType") } : { kind: pick("kind"), location: pick("location") };
  if (!clientId) return err("Pick a client, or On Leave.");
  if (clientId === LEAVE.id && !extra.leaveType) return err("Pick a leave type.");
  if (clientId !== LEAVE.id && !extra.kind) return err("Pick Work or Meeting.");
  if (clientId !== LEAVE.id && !extra.location) return err("Pick Remote or In-Office.");
  if (isHoliday(extra)) {
    hours = 0; // A holiday is a whole day with no time.
  } else if (start || end) {
    if (!start || !end) return err("Enter both start and end time, or neither.");
    hours = durationFromTimes(start, end);
    if (hours == null) return err("End time must be after start time.");
  } else if (hours == null) {
    return err("Enter hours, for example 2h, 1:30 or 90m.");
  }
  const entry = { id: form.editId || crypto.randomUUID(), date: drawer.date, clientId, ...extra, hours: Math.round(hours * 60) / 60, note: $("#fNote").value.trim() };
  if (start && !isHoliday(entry)) Object.assign(entry, { start, end });
  const i = db.entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) db.entries[i] = entry;
  else db.entries.push(entry);
  const edited = form.editId;
  form = freshForm();
  persist();
  render();
  toast(`${edited ? "Updated" : "Saved"} ${isHoliday(entry) ? "holiday" : `${fmtHours(entry.hours)} ${isWork(entry) ? `for ${client(clientId).name}` : `on leave (${entryName(entry)})`}`}`);
  focusForm();
}

function editEntry(id) {
  const e = db.entries.find((x) => x.id === id);
  form = { editId: e.id, clientId: e.clientId, kind: e.kind || "", location: e.location || "", leaveType: e.leaveType || "", hours: fmtHours(e.hours), start: e.start || "", end: e.end || "", note: e.note || "", showTimes: !!e.start };
  renderDrawer();
  $("#fHours").focus();
}

function deleteEntry(id) {
  lastDeleted = db.entries.find((e) => e.id === id);
  db.entries = db.entries.filter((e) => e.id !== id);
  if (form.editId === id) form = freshForm();
  persist();
  render();
  toast(isHoliday(lastDeleted) ? "Deleted holiday" : `Deleted ${fmtHours(lastDeleted.hours)} for ${entryName(lastDeleted)}`, true);
}

function addClient() {
  const input = $("#newClient");
  const name = input.value.trim();
  if (!name) return input.focus();
  const used = new Set(db.clients.map((c) => c.color));
  db.clients.push({
    id: crypto.randomUUID(),
    name,
    color: PRESETS.find((p) => !used.has(p)) || PRESETS[db.clients.length % PRESETS.length],
    rate: null,
    currency: db.clients.at(-1)?.currency || "USD",
    archived: false,
  });
  persist();
  render();
  $("#newClient").focus();
}

function updateClient(id, field, value) {
  const c = db.clients.find((x) => x.id === id);
  if (field === "name") {
    if (!value.trim()) return renderDrawer();
    c.name = value.trim();
  } else if (field === "rate") {
    const n = parseFloat(value.replace(",", "."));
    c.rate = n > 0 ? n : null;
  } else {
    c[field] = value;
  }
  persist();
  renderTotals();
  renderGrid();
  if (field === "color") renderDrawer();
}

let toastTimer;
function toast(msg, undo = false) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button data-act="undo">Undo</button>` : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 8000 : 4000);
}

// ---- events ----

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-act], [data-date], [data-edit], [data-del], [data-color], [data-hours]");
  if (!t) return;
  const rowId = t.closest("[data-id]")?.dataset.id;
  if (t.dataset.hours) {
    // A shortcut fills the hours box and clears start and end time, so the two cannot disagree.
    $("#fHours").value = fmtHours(+t.dataset.hours);
    $("#fStart").value = $("#fEnd").value = "";
    return $("#fHours").focus();
  }
  if (t.dataset.date) return openDay(t.dataset.date);
  if (t.dataset.edit) return editEntry(t.dataset.edit);
  if (t.dataset.del) return deleteEntry(t.dataset.del);
  if (t.dataset.color) {
    openPalette = null;
    return updateClient(rowId, "color", t.dataset.color);
  }
  const c = db.clients.find((x) => x.id === rowId);
  switch (t.dataset.act) {
    case "openClients": return openDrawer({ kind: "clients" }), $("#newClient").focus();
    case "close": return closeDrawer();
    case "prevMonth": view = new Date(view.getFullYear(), view.getMonth() - 1, 1); return render();
    case "nextMonth": view = new Date(view.getFullYear(), view.getMonth() + 1, 1); return render();
    case "thisMonth": view = new Date(); return render();
    case "prevDay": return openDay(iso(addDays(fromIso(drawer.date), -1)));
    case "nextDay": return openDay(iso(addDays(fromIso(drawer.date), 1)));
    case "cancelEdit": form = freshForm(); renderDrawer(); return focusForm();
    case "toggleTimes": {
      form.showTimes = !form.showTimes;
      $("#times").hidden = !form.showTimes;
      t.textContent = form.showTimes ? "Hide start and end time" : "Add start and end time";
      t.setAttribute("aria-expanded", form.showTimes);
      if (form.showTimes) $("#fStart").focus();
      return;
    }
    case "palette": openPalette = openPalette === rowId ? null : rowId; return renderDrawer();
    case "archive": c.archived = true; persist(); return render();
    case "restore": c.archived = false; persist(); return render();
    case "deleteClient":
      db.clients = db.clients.filter((x) => x.id !== rowId);
      persist();
      return render();
    case "undo":
      if (lastDeleted) db.entries.push(lastDeleted);
      lastDeleted = null;
      $("#toast").hidden = true;
      persist();
      return render();
  }
});

document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (ev.target.id === "entryForm") saveEntry();
  if (ev.target.id === "addClient") addClient();
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.dataset.field) return updateClient(t.closest("[data-id]").dataset.id, t.dataset.field, t.value);
  if (t.name === "client" || t.name === "leaveType") {
    const leave = $("#entryForm input[name=client]:checked")?.value === LEAVE.id;
    $("#workOpts").hidden = leave;
    $("#leaveOpts").hidden = !leave;
    $("#timeBlock").hidden = leave && $("#entryForm input[name=leaveType]:checked")?.value === "holiday";
    return;
  }
  if (t.id === "hoursPerDay") {
    const n = parseFloat(t.value.replace(",", "."));
    if (n > 0 && n <= 24) db.settings.hoursPerDay = n;
    persist();
    return render();
  }
  if (t.id === "fStart" || t.id === "fEnd") {
    const h = $("#fStart").value && $("#fEnd").value && durationFromTimes($("#fStart").value, $("#fEnd").value);
    if (h) $("#fHours").value = fmtHours(h);
    return;
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && drawer) closeDrawer();
});

// ---- start ----

fetch("/api/data")
  .then((r) => r.json())
  .then((data) => {
    db = { ...db, ...data, settings: { ...data.settings } };
    render();
  })
  .catch(() => toast("Could not load your data. Click the About Time icon in the Dock again."));
