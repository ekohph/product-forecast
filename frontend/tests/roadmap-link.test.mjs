import assert from "node:assert/strict";
import test from "node:test";
import {readRoadmapLink, createRoadmapLink} from "../src/features/plans/roadmap-link.ts";

test("shared URL round trips Korean names and reserved characters without Build or edit state", () => {
  const selected = {product: "4175 & A/B", phase: "내부 협의 완료", version: "0.91"};
  const url = new URL(createRoadmapLink("https://example.com/product-forecast?build=P1&tab=edit#old", selected));
  assert.equal(url.pathname, "/product-forecast");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.has("build"), false);
  assert.equal(url.searchParams.has("tab"), false);
  assert.deepEqual(readRoadmapLink(url.search), selected);
});
test("normal entry has no shared identity and incomplete or duplicate identities fail", () => {
  assert.equal(readRoadmapLink(""), null);
  assert.equal(readRoadmapLink("?unrelated=1"), null);
  for (const query of ["?product=4175", "?product=&phase=Plan&version=0.0", "?product=A&product=B&phase=Plan&version=0.0"]) {
    assert.throws(() => readRoadmapLink(query), /공유 링크/);
  }
});
