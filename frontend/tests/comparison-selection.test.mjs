import assert from "node:assert/strict";
import test from "node:test";
import { comparisonFields, comparisonSelection, comparisonBuilds } from "../src/features/plans/comparison-selection.ts";

test("comparison ignores Build and includes the union of both product lists", () => {
  const left = {product: "4175", build: "P1", phase: "Plan", version: "0.0"};
  assert.equal(comparisonSelection(left, {...left, build: "EVT"}).identical, true);
  assert.equal(comparisonSelection(left, {...left, build: ""}).complete, true);
  assert.deepEqual(comparisonBuilds(["P1", "EVT"], ["EVT", "DVT"]), [
    {build: "P1", inBaseline: true, inTarget: false},
    {build: "EVT", inBaseline: true, inTarget: true},
    {build: "DVT", inBaseline: false, inTarget: true},
  ]);
  assert.deepEqual(comparisonBuilds([], []), []);
});

const baseline = {product: "4175", build: "P1", phase: "Plan", version: "0.0"};
test("comparison blocks identical identities but accepts a difference in any field", () => {
  assert.equal(comparisonSelection(baseline, {...baseline}).identical, true);
  for (const field of comparisonFields) {
    const target = {...baseline, [field]: "다른 값"};
    assert.equal(comparisonSelection(baseline, target).identical, false);
    assert.equal(comparisonSelection(baseline, target).complete, true);
    assert.equal(comparisonSelection(target, target).identical, true);
  }
});
test("empty selections cannot proceed and changing either side invalidates a confirmed pair", () => {
  const target = {...baseline, version: "1.0"};
  const original = comparisonSelection(baseline, target);
  for (const field of comparisonFields) {
    assert.equal(comparisonSelection(baseline, {...target, [field]: " "}).complete, false);
    assert.equal(comparisonSelection({...baseline, [field]: ""}, target).complete, false);
    assert.notEqual(comparisonSelection({...baseline, [field]: "updated"}, target).pairKey, original.pairKey);
    assert.notEqual(comparisonSelection(baseline, {...target, [field]: "updated"}).pairKey, original.pairKey);
  }
});
