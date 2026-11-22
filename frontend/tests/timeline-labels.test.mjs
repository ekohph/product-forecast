import assert from "node:assert/strict";
import test from "node:test";
import {layoutTimelineLabels, layoutTimelineRanges, timelineLaneOffset} from "../src/features/plans/timeline-labels.ts";

test("overlapping arrows alternate below and above the axis at 4px intervals", () => {
  assert.deepEqual(Array.from({length: 7}, (_, lane) => timelineLaneOffset(lane)), [0, 4, -4, 8, -8, 12, -12]);
});

test("overlapping durations have separate lanes and disjoint durations reuse space", () => {
  assert.deepEqual(layoutTimelineRanges([
    {start: 0, end: 100, labelWidth: 20},
    {start: 50, end: 150, labelWidth: 20},
    {start: 120, end: 200, labelWidth: 20},
  ]), [0, 1, 0]);
});
test("nested and identical ranges, shared endpoints and wide names stay distinct", () => {
  assert.deepEqual(layoutTimelineRanges([
    {start: 0, end: 100, labelWidth: 20},
    {start: 0, end: 100, labelWidth: 20},
    {start: 30, end: 40, labelWidth: 20},
    {start: 100, end: 110, labelWidth: 20},
  ]), [0, 1, 2, 2]);
  assert.deepEqual(layoutTimelineRanges([{start: 40, end: 45, labelWidth: 100}, {start: 60, end: 65, labelWidth: 100}]), [0, 1]);
  assert.deepEqual(layoutTimelineRanges([]), []);
});

test("nearby dates shift left/right without overlap or exceeding the plot", () => {
  const labels = [0, 3, 98, 100].map(x => ({x, width: 20}));
  const result = layoutTimelineLabels(labels, 110);
  assert.ok(result.every(label => label.row === 0 && label.x >= 10 && label.x <= 100));
  result.slice(1).forEach((label, i) => assert.ok(label.x - result[i].x >= 28));
});
test("dense dates use extra rows only when their total width cannot fit", () => {
  const result = layoutTimelineLabels(Array.from({length: 10}, () => ({x: 50, width: 35})), 100);
  assert.equal(Math.max(...result.map(label => label.row)), 4);
  assert.deepEqual(layoutTimelineLabels([], 100), []);
});
