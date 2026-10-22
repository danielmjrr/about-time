import assert from "node:assert/strict";
import { parseDuration as p, fmtHours, monthGrid, weekStart, iso, totals, earnings, durationFromTimes, weekdaysInMonth, weekWorkdaysInMonth, remoteShare, daysOff, normalizeTime, nextQuarter } from "./web/lib.js";

assert.equal(p("2"), 2);
assert.equal(p("1.5"), 1.5);
assert.equal(p("1,5"), 1.5);
assert.equal(p("1:30"), 1.5);
assert.equal(p("90m"), 1.5);
assert.equal(p("2h"), 2);
assert.equal(p("1h30"), 1.5);
assert.equal(p("1h 30m"), 1.5);
for (const bad of ["", "abc", "0", "25", "1:75", "-1"]) assert.equal(p(bad), null, bad);

assert.equal(fmtHours(1.5), "1:30");
assert.equal(fmtHours(8), "8:00");

// September 2026 starts on a Tuesday, so the grid opens on Monday 31 August.
const g = monthGrid(new Date(2026, 8, 15));
assert.equal(iso(g[0][0]), "2026-08-31");
assert.equal(g.length, 5);
assert.equal(iso(g.at(-1)[6]), "2026-10-04");
assert.equal(iso(weekStart(new Date(2026, 8, 27))), "2026-09-21"); // Sunday belongs to the week before

const t = totals(
  [
    { clientId: "a", date: "2026-09-21", hours: 2 },
    { clientId: "b", date: "2026-09-22", hours: 3 },
    { clientId: "a", date: "2026-09-28", hours: 9 },
  ],
  "2026-09-21",
  "2026-09-28",
);
assert.equal(t.sum, 5);
assert.deepEqual(t.rows.map((r) => r.clientId), ["b", "a"]);

assert.deepEqual(
  earnings(
    [{ clientId: "a", hours: 2 }, { clientId: "b", hours: 3 }, { clientId: "c", hours: 1 }],
    [
      { id: "a", rate: 100 },
      { id: "b", rate: 50 },
      { id: "c", rate: null },
    ],
  ),
  350,
);

const located = [
  { date: "2026-09-21", hours: 3, location: "remote" },
  { date: "2026-09-22", hours: 1, location: "office" },
  { date: "2026-09-22", hours: 5 }, // old entry without a location: ignored
  { date: "2026-09-28", hours: 9, location: "office" }, // outside the range
];
assert.equal(remoteShare(located, "2026-09-21", "2026-09-28"), 75);
assert.equal(remoteShare([{ date: "2026-09-21", hours: 2 }], "2026-09-21", "2026-09-28"), null);

assert.equal(durationFromTimes("09:00", "11:30"), 2.5);
assert.equal(durationFromTimes("10:00", "09:00"), null);
assert.equal(weekdaysInMonth(new Date(2026, 8, 1)), 22);
assert.deepEqual(
  [
    ...daysOff(
      [
        { date: "2026-09-15", leaveType: "holiday", hours: 0 },
        { date: "2026-09-15", leaveType: "holiday", hours: 0 }, // same day counts once
        { date: "2026-09-19", leaveType: "vacation", hours: 0 }, // Saturday: not a workday
        { date: "2026-09-16", leaveType: "sick", hours: 8 }, // old sick entry with hours: still a whole day
        { date: "2026-09-17", leaveType: "vacation", hours: 0 },
        { date: "2026-09-18", leaveType: "other", hours: 4 }, // other leave has hours, not a day off
        { date: "2026-10-01", leaveType: "holiday", hours: 0 }, // other month
      ],
      "2026-09-01",
      "2026-10-01",
    ),
  ],
  [["2026-09-15", "holiday"], ["2026-09-16", "sick"], ["2026-09-17", "vacation"]],
);
assert.equal(weekWorkdaysInMonth(new Date(2026, 8, 21), new Date(2026, 8, 24)), 5);
assert.equal(weekWorkdaysInMonth(new Date(2026, 8, 28), new Date(2026, 9, 1)), 2); // Oct 1 and 2 only
assert.equal(weekWorkdaysInMonth(new Date(2026, 8, 28), new Date(2026, 8, 29)), 3); // Sep 28 to 30

for (const [i, o] of [["9", "09:00"], ["930", "09:30"], ["9:30", "09:30"], ["17.15", "17:15"], ["1230", "12:30"], ["24", null], ["9:75", null], ["abc", null], ["", null]]) assert.equal(normalizeTime(i), o, i);
assert.equal(nextQuarter(new Date(2026, 9, 22, 16, 13)), "16:15");
assert.equal(nextQuarter(new Date(2026, 9, 22, 16, 15)), "16:15");
assert.equal(nextQuarter(new Date(2026, 9, 22, 23, 58)), "23:45");

console.log("ok");
