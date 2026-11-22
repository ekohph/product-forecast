type SharedSelection = {product: string; phase: string; version: string};
const fields = ["product", "phase", "version"] as const;

export function readRoadmapLink(search: string): SharedSelection | null {
  const params = new URLSearchParams(search);
  if (!fields.some(field => params.has(field))) return null;
  const values = fields.map(field => params.get(field) ?? "");
  if (values.some(value => !value.trim() || value.length > 120) || fields.some(field => params.getAll(field).length !== 1)) {
    throw new Error("공유 링크에 제품·Phase·Version 정보가 올바르게 지정되지 않았습니다.");
  }
  return {product: values[0], phase: values[1], version: values[2]};
}

export function createRoadmapLink(address: string, selection: SharedSelection) {
  const url = new URL(address);
  url.search = ""; url.hash = "";
  for (const field of fields) url.searchParams.set(field, selection[field]);
  return url.toString();
}
