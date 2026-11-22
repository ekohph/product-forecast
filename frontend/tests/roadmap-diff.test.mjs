import assert from "node:assert/strict";
import test from "node:test";
import { compareRoadmapItems } from "../src/features/plans/roadmap-diff.ts";
const item = {id: "a", name: "Sample", startDate: "2026-12-01", endDate: "2026-12-10"};
test("detects same, changed dates, rename and milestone content by stable ID", () => {
  assert.equal(compareRoadmapItems([item], [{...item}])[0].status, "unchanged");
  for (const change of [{startDate: "2026-12-02"}, {endDate: "2026-12-11"}, {name: "Renamed"}, {kind: "milestone", endDate: item.startDate, content: "Ready"}]) {
    assert.equal(compareRoadmapItems([item], [{...item, ...change}])[0].status, "changed");
  }
  const milestone = {...item, kind: "milestone", endDate: item.startDate, content: "Before"};
  assert.equal(compareRoadmapItems([milestone], [{...milestone, content: "After"}])[0].status, "changed");
});
test("matches unique names across IDs, does not guess duplicate or different-kind matches", () => {
  assert.equal(compareRoadmapItems([item], [{...item, id: "b"}])[0].status, "unchanged");
  const ambiguous = compareRoadmapItems([item, {...item, id: "c"}], [{...item, id: "b"}]);
  assert.deepEqual(ambiguous.map(row => row.status).sort(), ["added", "removed", "removed"]);
  const changedKind = compareRoadmapItems([item], [{...item, id: "b", kind: "milestone", endDate: item.startDate}]);
  assert.deepEqual(changedKind.map(row => row.status).sort(), ["added", "removed"]);
});
test("stable IDs win over name matching and missing entries become added or removed", () => {
  const rows = compareRoadmapItems([item], [{...item, id: "b"}, {...item, name: "Renamed"}]);
  assert.equal(rows.find(row => row.after.id === "b").status, "added");
  assert.equal(rows.find(row => row.after.id === "a").status, "changed");
  assert.equal(compareRoadmapItems([item], [])[0].status, "removed");
  assert.equal(compareRoadmapItems([], [item])[0].status, "added");
});
