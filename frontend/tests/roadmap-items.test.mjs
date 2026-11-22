import assert from "node:assert/strict";
import test from "node:test";
import { getRoadmapMonths } from "../src/features/plans/roadmap-months.ts";
import { monthRange, dateAtPosition, itemPosition, resizeItem, moveItem, moveItemsTogether, sortRoadmapItems, roadmapSortOptions, roadmapTimelineTicks, roadmapToday } from "../src/features/plans/roadmap-items.ts";
const months = getRoadmapMonths(new Date("2028-01-15T00:00:00Z"));
const item = {id: "test", name: "Task", ...monthRange("2028-02")};

test("group move preserves durations and gaps across leap day and clamps the whole group", () => {
  const originals = [
    {...item, startDate: "2028-02-25", endDate: "2028-02-28"},
    {id: "milestone", name: "M1", kind: "milestone", content: "details", startDate: "2028-03-02", endDate: "2028-03-02"},
  ];
  const before = structuredClone(originals);
  const moved = moveItemsTogether(originals, 5, "2028-02-01", "2028-03-31");
  assert.deepEqual(moved.map(value => [value.startDate, value.endDate]), [["2028-03-01", "2028-03-04"], ["2028-03-07", "2028-03-07"]]);
  assert.equal(moved[1].content, "details");
  const right = moveItemsTogether(originals, 100, "2028-02-01", "2028-03-31");
  assert.equal(right[1].endDate, "2028-03-31");
  const left = moveItemsTogether(originals, -100, "2028-02-01", "2028-03-31");
  assert.equal(left[0].startDate, "2028-02-01");
  for (const result of [moved, right, left]) {
    const delta = Date.parse(result[0].startDate) - Date.parse(originals[0].startDate);
    result.forEach((value, index) => {
      assert.equal(Date.parse(value.startDate) - Date.parse(originals[index].startDate), delta);
      assert.equal(Date.parse(value.endDate) - Date.parse(originals[index].endDate), delta);
    });
  }
  assert.deepEqual(originals, before);
});

test("partially hidden group cannot move farther outside, and a single selection matches single movement", () => {
  const hidden = {...item, startDate: "2028-01-25", endDate: "2028-02-05"};
  const group = [hidden, item];
  assert.deepEqual(moveItemsTogether(group, -10, "2028-02-01", "2028-03-31"), group);
  assert.equal(moveItemsTogether(group, 3, "2028-02-01", "2028-03-31")[0].startDate, "2028-01-28");
  assert.deepEqual(moveItemsTogether([item], 50, "2028-02-01", "2028-03-31"), [moveItem(item, 50, "2028-02-01", "2028-03-31")]);
  assert.deepEqual(moveItemsTogether([], 1, "2028-02-01", "2028-03-31"), []);
});
test("timeline groups shared dates and shows years only at transitions", () => {
  const range = getRoadmapMonths(new Date("2027-11-15T00:00:00Z"));
  const milestone = {id: "m1", name: "Launch", kind: "milestone", startDate: "2028-01-02", endDate: "2028-01-02"};
  const ticks = roadmapTimelineTicks(range, [milestone, {...milestone, id: "m2"},
    {...milestone, id: "previous", startDate: "2027-12-20", endDate: "2027-12-20"},
    {...milestone, id: "next", startDate: "2028-01-04", endDate: "2028-01-04"},
    {...item, startDate: "2028-01-03", endDate: "2028-01-31"}]);
  assert.equal(ticks[0].label, "'27 12/20");
  assert.equal(ticks.find(t => t.date === "2028-01-02").label, "'28 01/02");
  assert.equal(ticks.find(t => t.date === "2028-01-03").label, "01/03");
  assert.equal(ticks.find(t => t.date === "2028-01-04").label, "01/04");
  assert.equal(ticks.find(t => t.date === "2028-01-31").label, "01/31");
  assert.equal(ticks.find(t => t.date === "2028-01-03").starts, true);
  assert.equal(ticks.find(t => t.date === "2028-01-03").ends, false);
  assert.equal(ticks.find(t => t.date === "2028-01-31").ends, true);
  assert.equal(ticks.find(t => t.date === "2028-01-02").starts, false);
  assert.equal(ticks.find(t => t.date === "2028-01-02").milestones.length, 2);
  assert.equal(ticks.filter(t => t.date === "2028-01-31").length, 1);
  assert.ok(ticks.every((tick, index) => tick.position >= 0 && tick.position < 1 && (!index || ticks[index - 1].position < tick.position)));
});
test("timeline excludes hidden months and handles empty ranges", () => {
  assert.deepEqual(roadmapTimelineTicks([], [item]), []);
  const ticks = roadmapTimelineTicks(months.filter(month => month.key !== "2028-02"), [item]);
  assert.ok(ticks.every(tick => !tick.date.startsWith("2028-02")));
  assert.deepEqual(ticks, []);
});
test("milestone date classification uses Korean midnight", () => {
  assert.equal(roadmapToday(new Date("2026-11-21T14:59:59Z")), "2026-11-21");
  assert.equal(roadmapToday(new Date("2026-11-21T15:00:00Z")), "2026-11-22");
});
test("default spans first to last day including leap February", () => {
  assert.deepEqual(monthRange("2028-02"), {startDate: "2028-02-01", endDate: "2028-02-29"});
  assert.equal(monthRange("2027-02").endDate, "2027-02-28");
});
test("resize maps month boundaries to inclusive end dates", () => {
  assert.equal(dateAtPosition(months, 2, "end"), "2028-02-29");
  assert.equal(dateAtPosition(months, 2, "start"), "2028-03-01");
  assert.equal(dateAtPosition(months, -1, "start"), "2028-01-01");
  assert.equal(dateAtPosition(months, 99, "end"), "2028-06-30");
});
test("resizing cannot reverse dates", () => {
  assert.equal(resizeItem(item, "start", "2028-03-01").startDate, item.endDate);
  assert.equal(resizeItem(item, "end", "2028-01-01").endDate, item.startDate);
});
test("whole month width and hidden month behavior", () => {
  const position = itemPosition(item, months);
  assert.ok(position);
  assert.ok(Math.abs(position.left - 100 / 6) < 0.0001);
  assert.ok(Math.abs(position.width - 100 / 6) < 0.0001);
  assert.equal(itemPosition(item, months.filter(m => m.key !== "2028-02")), null);
  const span = {...item, startDate: "2028-01-01", endDate: "2028-03-31"};
  assert.equal(itemPosition(span, months.filter(m => m.key !== "2028-02")).width, 40);
});

test("moving preserves duration across leap day and clamps at visible boundaries", () => {
  const moved = moveItem(item, 28, "2028-01-01", "2028-06-30");
  assert.equal(moved.startDate, "2028-02-29");
  assert.equal(moved.endDate, "2028-03-28");
  const right = moveItem(item, 999, "2028-01-01", "2028-06-30");
  assert.equal(right.startDate, "2028-06-02");
  assert.equal(right.endDate, "2028-06-30");
  const left = moveItem(item, -999, "2028-01-01", "2028-06-30");
  assert.equal(left.startDate, "2028-01-01");
  assert.equal(left.endDate, "2028-01-29");
  assert.equal(item.startDate, "2028-02-01");
});

test("milestones move as a single date across years and retain content", () => {
  const milestone = {...item, kind: "milestone", content: "release", startDate: "2027-12-31", endDate: "2027-12-31"};
  const moved = moveItem(milestone, 1, "2027-12-01", "2028-03-31");
  assert.equal(moved.startDate, "2028-01-01");
  assert.equal(moved.endDate, moved.startDate);
  assert.equal(moved.content, "release");
});

test("six sorts preserve input, stable ties, and put non-milestones last for milestone sorting", () => {
  const rows = [
    {...item, id: "a", startDate: "2028-01-01", endDate: "2028-03-31"},
    {...item, id: "b", kind: "milestone", startDate: "2028-02-10", endDate: "2028-02-10"},
    {...item, id: "c", kind: "milestone", startDate: "2028-01-15", endDate: "2028-01-15"},
    {...item, id: "d", startDate: "2028-01-01", endDate: "2028-02-01"},
  ];
  const expected = ["adcb", "cdba", "cbad", "bcad", "abdc", "bcad"];
  roadmapSortOptions.forEach((sort, index) => assert.equal(sortRoadmapItems(rows, sort).map(row => row.id).join(""), expected[index]));
  assert.equal(rows.map(row => row.id).join(""), "abcd");
});
