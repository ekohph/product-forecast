import assert from "node:assert/strict";
import test from "node:test";
import { getRoadmapMonths } from "../src/features/plans/roadmap-months.ts";

test("November spans through March of the following year", () => {
  assert.deepEqual(getRoadmapMonths(new Date("2026-11-21T00:00:00Z")).map(m => m.key), ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
});
test("quarter end includes the entire next quarter", () => {
  assert.deepEqual(getRoadmapMonths(new Date("2026-03-15T00:00:00Z")).map(m => m.key), ["2026-03", "2026-04", "2026-05", "2026-06"]);
});
test("Korean midnight uses the new month and quarter", () => {
  const months = getRoadmapMonths(new Date("2026-12-31T15:00:00Z"));
  assert.equal(months[0].key, "2027-01");
  assert.equal(months.at(-1).key, "2027-06");
  assert.equal(months.length, 6);
  assert.equal(months[0].quarter, 1);
  assert.equal(months.at(-1).quarter, 2);
});

test("relative months cross year boundaries", async () => {
  const { shiftMonth } = await import("../src/features/plans/roadmap-months.ts");
  const january = getRoadmapMonths(new Date("2027-01-01T00:00:00Z"))[0];
  assert.equal(shiftMonth(january, -1).key, "2026-12");
  const december = shiftMonth(january, -1);
  assert.equal(shiftMonth(december, 1).key, "2027-01");
  assert.equal(december.quarter, 4);
  assert.equal(shiftMonth(december, 1).quarter, 1);
});
