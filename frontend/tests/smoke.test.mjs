import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:3000";

test("subpath page renders with prefixed JavaScript assets", async () => {
  const response = await fetch(`${origin}/product-forecast`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /제품 로드맵 관리/);
  const asset = html.match(/src="(\/product-forecast\/_next\/[^" ]+\.js[^" ]*)"/);
  assert.ok(asset, "JavaScript must load under the app base path");
  assert.equal((await fetch(new URL(asset[1].replaceAll("&amp;", "&"), origin))).status, 200);
});

test("same-origin API reaches FastAPI", async () => {
  const response = await fetch(`${origin}/product-forecast/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "product-forecast" });
});

test("plan workspace and same-origin plan API are available", async () => {
  const page = await fetch(`${origin}/product-forecast`);
  const html = await page.text();
  assert.match(html, /조회/);
  assert.match(html, /id="tab-view"[\s\S]*id="tab-edit"[\s\S]*id="tab-compare"/);
  assert.match(html, /id="panel-edit"/);
  assert.match(html, /비교/);
  assert.doesNotMatch(html, /신규 제품 계획|다시 불러오기/);
  const response = await fetch(`${origin}/product-forecast/api/v1/plans`);
  assert.equal(response.status, 200);
  const plans = await response.json();
  assert.ok(Array.isArray(plans));
  for (const plan of plans) {
    assert.equal(typeof plan.product_name, "string");
    assert.ok(Array.isArray(plan.versions));
    assert.ok(Array.isArray(plan.phases));
  }
});

test("saved roadmap catalog and lookup work through the same-origin API", async () => {
  const catalog = await fetch(`${origin}/product-forecast/api/v1/roadmaps/catalog`);
  assert.equal(catalog.status, 200);
  const options = await catalog.json();
  for (const name of ["product", "build", "phase", "version"]) assert.ok(Array.isArray(options[name]));
  assert.ok(options.phase.includes("내부 협의 완료"));
  const query = new URLSearchParams({product: "4175", build: "P1", phase: "Plan", version: "0.0"});
  const response = await fetch(`${origin}/product-forecast/api/v1/roadmaps?${query}`);
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.ok(Number.isInteger(record.revision));
  assert.ok(record.data === null || (Array.isArray(record.data.months) && Array.isArray(record.data.items)));
});
