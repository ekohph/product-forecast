export type TimelinePrimitive = {kind: "line" | "circle" | "text"; x: number; y: number; w: number; h: number; fill: string; stroke: string; strokeWidth: number; dashed?: boolean; text?: string; fontSize?: number; bold?: boolean};
export type TimelineImage = {dataUrl: string; width: number; height: number; heading?: string; rows?: {build: string; y: number; height: number; elements: TimelinePrimitive[]}[]};

function editableElements(svg: SVGSVGElement): TimelinePrimitive[] {
  return Array.from(svg.querySelectorAll<SVGGraphicsElement>("line,circle,text")).map(node => {
    const css = getComputedStyle(node), box = node.getBBox();
    const number = (key: string) => Number(node.getAttribute(key) || 0);
    const kind = node.tagName as TimelinePrimitive["kind"];
    const text = Array.from(node.childNodes).filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join("");
    return {kind, x: kind === "line" ? number("x1") : box.x, y: kind === "line" ? number("y1") : box.y,
      w: kind === "line" ? number("x2") - number("x1") : box.width, h: kind === "line" ? number("y2") - number("y1") : box.height,
      fill: css.fill, stroke: css.stroke, strokeWidth: parseFloat(css.strokeWidth) || 0, dashed: css.strokeDasharray !== "none" && /[1-9]/.test(css.strokeDasharray),
      text, fontSize: parseFloat(css.fontSize), bold: Number(css.fontWeight) >= 600 || css.fontWeight === "bold"};
  });
}

export async function captureTimelines(root: HTMLElement, builds: string[], heading: string, rowLabels: ReadonlyMap<string, string> = new Map()): Promise<TimelineImage> {
  await document.fonts.ready;
  const exportRows = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-export-build]")).map(row => [row.dataset.exportBuild, row]));
  const rows = builds.map(key => {
    const build = rowLabels.get(key) ?? key;
    const row = exportRows.get(key);
    const svg = row?.querySelector("svg");
    if (!svg) throw new Error(`${build}: 타임라인을 불러온 뒤 다시 시도하세요. 표시할 월이 없는 표는 내보낼 수 없습니다.`);
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) throw new Error("타임라인이 화면에 표시된 상태에서 다시 시도하세요.");
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const source = [svg, ...Array.from(svg.querySelectorAll("*"))];
    const target = [copy, ...Array.from(copy.querySelectorAll("*"))];
    source.forEach((node, index) => {
      const css = getComputedStyle(node);
      const properties = ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-family", "font-size", "font-weight", "font-variant-numeric", "text-anchor", "opacity"];
      target[index].setAttribute("style", properties.map(property => `${property}:${css.getPropertyValue(property)}`).join(";"));
    });
    const legend = Array.from(row!.querySelectorAll<HTMLElement>(".overlay-legend span"));
    const offset = legend.length ? 24 : 0;
    const elements = editableElements(svg).map(element => ({...element, y: element.y + offset}));
    if (offset) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      while (copy.firstChild) group.append(copy.firstChild);
      group.setAttribute("transform", `translate(0 ${offset})`); copy.append(group);
      let x = 4;
      for (const entry of legend) {
        const text = entry.textContent || "", fill = getComputedStyle(entry).color;
        const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
        node.textContent = text; node.setAttribute("x", String(x)); node.setAttribute("y", "15");
        node.setAttribute("style", `fill:${fill};font:12px sans-serif`); copy.append(node);
        const width = entry.getBoundingClientRect().width;
        elements.push({kind: "text", x, y: 2, w: width + 4, h: 16, text, fill, stroke: "none", strokeWidth: 0, fontSize: 12});
        x += width + 16;
      }
    }
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(bounds.width)); copy.setAttribute("height", String(bounds.height + offset));
    return {build, width: bounds.width, height: bounds.height + offset, elements, xml: new XMLSerializer().serializeToString(copy)};
  });
  if (!rows.length) throw new Error("다운로드할 타임라인을 선택하세요.");
  const width = Math.ceil(Math.max(...rows.map(row => row.width)) + 120);
  const height = Math.ceil(48 + rows.reduce((total, row) => total + Math.max(36, row.height) + 8, 0));
  const scale = Math.min(2, 16000 / Math.max(width, height), Math.sqrt(32000000 / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 생성할 수 없습니다.");
  ctx.scale(scale, scale); ctx.fillStyle = "#fafcff"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#172b4d"; ctx.font = "bold 16px sans-serif"; ctx.fillText(heading, 12, 26, width - 24);
  let y = 44;
  const editableRows: NonNullable<TimelineImage["rows"]> = [];
  for (const row of rows) {
    editableRows.push({build: row.build, y, height: row.height, elements: row.elements});
    const url = URL.createObjectURL(new Blob([row.xml], {type: "image/svg+xml;charset=utf-8"}));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error("타임라인 이미지 변환에 실패했습니다.")); image.src = url;});
      ctx.font = "bold 14px sans-serif"; ctx.fillStyle = "#172b4d";
      ctx.fillText(row.build, 12, y + Math.max(20, row.height / 2), 94);
      ctx.drawImage(image, 108, y, row.width, row.height);
    } finally {URL.revokeObjectURL(url);}
    y += Math.max(36, row.height) + 8;
  }
  return {dataUrl: canvas.toDataURL("image/png"), width, height, heading, rows: editableRows};
}

export async function createTimelinePresentation(image: TimelineImage, title: string) {
  const {createEditablePresentation} = await import("./timeline-pptx.ts");
  return createEditablePresentation(image, title);
}

export async function downloadTimeline(image: TimelineImage, format: "png" | "pptx", filename: string) {
  const name = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100);
  if (format === "png") {
    const link = document.createElement("a"); link.href = image.dataUrl; link.download = `${name}.png`;
    document.body.append(link); link.click(); link.remove();
  } else {
    const bytes = await createTimelinePresentation(image, filename);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"}));
    const link = document.createElement("a"); link.href = url; link.download = `${name}.pptx`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
