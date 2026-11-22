import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createTimelinePresentation, downloadTimeline } from "../src/features/plans/timeline-export.ts";
const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=";
const image = {dataUrl: `data:image/png;base64,${data}`, width: 1000, height: 300};
test("PPTX contains editable shapes and nested Build groups without a bitmap", async () => {
  const elements = [
    {kind: "line", x: 20, y: 30, w: 700, h: 0, fill: "none", stroke: "rgb(99, 115, 138)", strokeWidth: 2, dashed: true},
    {kind: "circle", x: 94, y: 24, w: 12, h: 12, fill: "rgb(37, 99, 235)", stroke: "rgb(0, 0, 0)", strokeWidth: 2},
    {kind: "text", x: 80, y: 0, w: 90, h: 15, fill: "rgb(67, 83, 106)", stroke: "none", strokeWidth: 0, text: "'26 01/01", fontSize: 12},
    {kind: "text", x: 80, y: 40, w: 120, h: 15, fill: "#65408d", stroke: "none", strokeWidth: 0, text: "항목 & 검증", fontSize: 12},
  ];
  const buffer = await createTimelinePresentation({...image, heading: "4175 · Plan · Version 0.0", rows: [
    {build: "P1 & EVT", y: 44, height: 70, elements},
    {build: "DVT", y: 122, height: 70, elements: []},
  ]}, "4175 · Plan · Version 0.0");
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  assert.equal(slides.length, 1);
  const media = Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.png$/.test(name));
  assert.equal(media.length, 0);
  const xml = await zip.file(slides[0]).async("string");
  assert.doesNotMatch(xml, /<p:pic>/);
  assert.equal((xml.match(/<p:grpSp>/g) || []).length, 3);
  assert.equal((xml.match(/<p:sp>/g) || []).length, 7);
  assert.match(xml, /name="P1 &amp; EVT"/);
  assert.match(xml, /name="DVT"/);
  assert.match(xml, /prst="ellipse"/);
  assert.match(xml, /<a:prstDash val="dash"\s*\/>/);
  assert.match(xml, /val="2563eb"/i);
  assert.match(xml, /<a:t>항목 &amp; 검증<\/a:t>/);
  assert.match(xml, /<p:grpSp>[^]*name="Product Forecast timelines"[^]*<p:grpSp>[^]*name="P1 &amp; EVT"/);
  const ids = Array.from(xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
test("PPTX refuses a stale preview without editable data", async () => {
  await assert.rejects(createTimelinePresentation(image, "old preview"), /다시 미리보기/);
});
test("PNG downloads the preview unchanged and sanitizes the filename", async () => {
  let clicked = false, removed = false;
  const link = {click: () => {clicked = true;}, remove: () => {removed = true;}};
  globalThis.document = {createElement: () => link, body: {append: () => {}}};
  try {
    await downloadTimeline(image, "png", "4175/Plan:0.0");
    assert.equal(link.href, image.dataUrl);
    assert.equal(link.download, "4175_Plan_0.0.png");
    assert.ok(clicked && removed);
  } finally {delete globalThis.document;}
});
