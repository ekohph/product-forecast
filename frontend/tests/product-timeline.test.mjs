import assert from "node:assert/strict";
import test from "node:test";
import {buildProductTimeline} from "../src/features/plans/product-timeline.ts";

const jan = {key: "2027-01", label: "Jan", year: 2027, quarter: 1};
const feb = {key: "2027-02", label: "Feb", year: 2027, quarter: 1};
const mar = {key: "2027-03", label: "Mar", year: 2027, quarter: 1};
const range = (id, startDate, endDate) => ({id, name: id, startDate, endDate});
const windows = items => items.filter(item => item.kind !== "milestone").map(({startDate, endDate}) => [startDate, endDate]);

test("unions overlapping or adjacent coverage and leaves uncovered days blank", () => {
  const poc = [range("a", "2027-01-01", "2027-01-05"), range("b", "2027-01-15", "2027-01-20")];
  const p1 = [range("a", "2027-01-03", "2027-01-07"), range("c", "2027-01-21", "2027-01-24")];
  const result = buildProductTimeline([{build: "POC", months: [jan], items: poc}, {build: "P1", months: [jan], items: p1}], [feb]);
  assert.deepEqual(result.months, [jan]);
  assert.deepEqual(windows(result.items), [["2027-01-01", "2027-01-07"], ["2027-01-15", "2027-01-24"]]);
  assert.deepEqual(windows(result.itemsByBuild.get("POC")), windows(poc));
  assert.deepEqual(windows(result.itemsByBuild.get("P1")), windows(p1));
});

test("one continuous calendar scale leaves a missing Build month empty", () => {
  const item = range("a", "2027-01-25", "2027-03-03");
  const result = buildProductTimeline([{build: "POC", months: [jan, mar], items: [item]}, {build: "P1", months: [feb], items: []}], []);
  assert.deepEqual(result.months, [jan, feb, mar]);
  assert.deepEqual(windows(result.items), [["2027-01-25", "2027-01-31"], ["2027-03-01", "2027-03-03"]]);
  assert.deepEqual(windows(result.itemsByBuild.get("POC")), windows(result.items));
  assert.deepEqual(windows(result.itemsByBuild.get("P1")), []);
  assert.equal(item.endDate, "2027-03-03");
});

test("uses the fallback scale for empty schedules and does not turn milestones into ranges", () => {
  assert.deepEqual(buildProductTimeline([{build: "POC", months: [], items: []}], [jan]).items, []);
  assert.deepEqual(buildProductTimeline([], [jan]).months, [jan]);
  const milestone = {...range("gate", "2027-01-16", "2027-01-16"), kind: "milestone", content: "Review"};
  const summary = buildProductTimeline(["POC", "P1"].map(build => ({build, months: [jan], items: [milestone]})), []);
  assert.deepEqual(windows(summary.items), []);
  assert.equal(new Set(summary.items.map(item => item.id)).size, 2);
  assert.deepEqual(summary.items.map(item => [item.startDate, item.content]), [["2027-01-16", "Review"], ["2027-01-16", "Review"]]);
});

test("products with different stored months can use one calendar scale without changing coverage", async () => {
  const {sharedTimelineMonths} = await import("../src/features/plans/product-timeline.ts");
  const left = [{build: "POC", months: [jan, feb], items: [range("left", "2027-02-10", "2027-02-15")]}];
  const right = [{build: "EVT", months: [feb, mar], items: [range("right", "2027-02-10", "2027-02-18")]}];
  const shared = sharedTimelineMonths([mar, feb, jan, feb], []);
  assert.deepEqual(shared, [jan, feb, mar]);
  const views = [left, right, []].map(s => buildProductTimeline(s, [], shared));
  assert.ok(views.every(view => view.months === shared));
  assert.deepEqual(views.map(view => windows(view.items)), [
    [["2027-02-10", "2027-02-15"]], [["2027-02-10", "2027-02-18"]], [],
  ]);
});
