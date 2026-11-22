import assert from "node:assert/strict";
import test from "node:test";
import {nextRoadmapVersions, formatVersionUpdatedAt, phaseAdvanceVersions, sortVersionsDescending} from "../src/features/plans/roadmap-versions.ts";

test("copy sources sort numerically descending without modifying their original order", () => {
  const versions = ["0.9", "2.0", "0.991", "10.0", "0.91", "0.99", "0.0", "legacy"];
  const original = [...versions];
  assert.deepEqual(sortVersionsDescending(versions), ["10.0", "2.0", "0.991", "0.99", "0.91", "0.9", "0.0", "legacy"]);
  assert.deepEqual(versions, original);
  assert.deepEqual(sortVersionsDescending(["0.99999999999999999998", "0.99999999999999999999"]), ["0.99999999999999999999", "0.99999999999999999998"]);
  assert.deepEqual(sortVersionsDescending([]), []);
});

test("phase advance defaults to empty zero, otherwise highest minor then major", () => {
  assert.deepEqual(phaseAdvanceVersions([]), ["0.0"]);
  assert.deepEqual(phaseAdvanceVersions([{version: "0.0", has_content: false}, {version: "9.9", has_content: true}]), ["0.0"]);
  assert.deepEqual(phaseAdvanceVersions([{version: "0.99", has_content: false}, {version: "0.0", has_content: true}, {version: "0.2", has_content: true}]), ["0.991", "1.0"]);
  assert.deepEqual(phaseAdvanceVersions([{version: "10.8", has_content: false}, {version: "0.0", has_content: true}, {version: "2.9", has_content: true}]), ["10.9", "11.0"]);
});

test("version update timestamps use Korean time, zero padding and 24-hour midnight", () => {
  assert.equal(formatVersionUpdatedAt("2026-12-31T15:00:00Z"), "2027-01-01 00:00:00");
  assert.equal(formatVersionUpdatedAt("2026-01-02T03:04:05.123+00:00"), "2026-01-02 12:04:05");
  assert.equal(formatVersionUpdatedAt(null), "—");
  assert.equal(formatVersionUpdatedAt("invalid"), "—");
});

test("minor increments change at each all-nine boundary", () => {
  for (const [current, minor, increment] of [
    ["0.0", "0.1", "0.1"], ["0.8", "0.9", "0.1"], ["0.9", "0.91", "0.01"],
    ["0.98", "0.99", "0.01"], ["0.99", "0.991", "0.001"],
    ["0.999", "0.9991", "0.0001"], ["2.9", "2.91", "0.01"],
  ]) {
    const result = nextRoadmapVersions([current]);
    assert.equal(result.minor, minor);
    assert.equal(result.increment, increment);
  }
});

test("highest numeric version wins regardless of selection order or legacy labels", () => {
  assert.deepEqual(nextRoadmapVersions(["0.99", "10.8", "2.9", "draft", "10.2"]), {minor: "10.9", major: "11.0", increment: "0.1"});
  assert.equal(nextRoadmapVersions(["0.8"]).major, "1.0");
  assert.equal(nextRoadmapVersions(["0.99", "1.0"]).minor, "1.1");
  assert.deepEqual(nextRoadmapVersions([]), {minor: "0.1", major: "1.0", increment: "0.1"});
  assert.equal(nextRoadmapVersions(["0.90"]).minor, "0.91");
});

test("long decimals and large major versions stay exact", () => {
  assert.equal(nextRoadmapVersions(["0.99999999999999999999"]).minor, "0.999999999999999999991");
  assert.equal(nextRoadmapVersions(["99999999999999999999.8"]).major, "100000000000000000000.0");
});
