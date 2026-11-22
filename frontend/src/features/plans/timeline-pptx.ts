import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import type {TimelineImage} from "./timeline-export";

const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}[char]!));
function color(value: string) {
  if (value.startsWith("#")) return value.slice(1);
  const rgb = value.match(/[\d.]+/g);
  return rgb?.slice(0, 3).map(part => Math.round(Number(part)).toString(16).padStart(2, "0")).join("") || "000000";
}

/** Native shapes plus nested DrawingML groups; no raster image is embedded. */
export async function createEditablePresentation(image: TimelineImage, title: string): Promise<Uint8Array> {
  if (!image.rows?.length) throw new Error("편집 가능한 타임라인을 다시 미리보기 해 주세요.");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; pptx.title = title; pptx.subject = "Editable Product Forecast timelines";
  const slide = pptx.addSlide(); slide.background = {color: "FAFCFF"};
  const scale = Math.min(12.93 / image.width, 7.1 / image.height);
  const left = (13.333333 - image.width * scale) / 2, top = (7.5 - image.height * scale) / 2;
  const box = (x: number, y: number, w: number, h: number) => ({x: left + x * scale, y: top + y * scale, w: w * scale, h: h * scale});
  function text(value: string, x: number, y: number, w: number, h: number, size: number, fill: string, bold = false) {
    slide.addText(value, {...box(x, y, w, h), fontFace: "Arial", fontSize: size * scale * 72, color: color(fill), bold,
      margin: 0, breakLine: false, valign: "middle", fit: "shrink", paraSpaceAfter: 0, objectName: value});
  }
  text(image.heading || title, 12, 10, image.width - 24, 20, 16, "#172b4d", true);
  const counts: number[] = [];
  for (const row of image.rows) {
    text(row.build, 12, row.y + Math.max(20, row.height / 2) - 14, 94, 18, 14, "#172b4d", true);
    for (const element of row.elements) {
      const {x, y, w, h} = box(108 + element.x, row.y + element.y, element.w, element.h);
      if (element.kind === "text") {
        // getBBox gives rendered glyph bounds. Allow modest font-metric differences in PowerPoint.
        text(element.text || "", 108 + element.x - 1, row.y + element.y - 1, element.w + 2, element.h + 2,
          element.fontSize || 12, element.fill, element.bold);
      } else {
        slide.addShape(element.kind === "circle" ? pptx.ShapeType.ellipse : pptx.ShapeType.line, {
          x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h),
          flipV: (w < 0) !== (h < 0),
          line: {color: color(element.stroke), width: element.strokeWidth * scale * 72, transparency: element.stroke === "none" ? 100 : 0, dashType: element.dashed ? "dash" : "solid"},
          fill: {color: color(element.fill), transparency: element.fill === "none" ? 100 : 0},
          objectName: element.kind === "circle" ? "Milestone" : "Timeline line",
        });
      }
    }
    counts.push(1 + row.elements.length);
  }
  // PptxGenJS 4 has no public grouping API. Wrap its native shapes in standard
  // p:grpSp elements using identical parent/child coordinates (no layout change).
  const zip = await JSZip.loadAsync(await pptx.write({outputType: "arraybuffer"}) as ArrayBuffer);
  const path = "ppt/slides/slide1.xml", xml = await zip.file(path)!.async("string");
  const shapes = xml.match(/<p:sp>[^]*?<\/p:sp>/g) || [];
  if (shapes.length !== 1 + counts.reduce((sum, count) => sum + count, 0)) throw new Error("PPTX 도형 그룹을 구성하지 못했습니다.");
  let id = Math.max(...Array.from(xml.matchAll(/<p:cNvPr\b[^>]*\bid="(\d+)"/g), match => Number(match[1]))) + 1;
  function group(name: string, children: string, bounds: ReturnType<typeof box>) {
    const emu = (value: number) => Math.round(value * 914400);
    const {x, y, w, h} = bounds;
    const offset = `x="${emu(x)}" y="${emu(y)}"`, extent = `cx="${emu(w)}" cy="${emu(h)}"`;
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id++}" name="${escapeXml(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off ${offset}/><a:ext ${extent}/><a:chOff ${offset}/><a:chExt ${extent}/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
  }
  let cursor = 1;
  const children = shapes[0] + image.rows.map((row, index) => {
    const members = shapes.slice(cursor, cursor + counts[index]).join(""); cursor += counts[index];
    return group(row.build, members, box(0, row.y, image.width, Math.max(36, row.height)));
  }).join("");
  const grouped = group("Product Forecast timelines", children, box(0, 0, image.width, image.height));
  let inserted = false;
  zip.file(path, xml.replace(/<p:sp>[^]*?<\/p:sp>/g, () => {if (inserted) return ""; inserted = true; return grouped;}));
  return zip.generateAsync({type: "uint8array", compression: "DEFLATE"});
}
