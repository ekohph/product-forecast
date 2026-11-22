import type { RoadmapItem } from "./roadmap-items";

export type RoadmapDifference = {before?: RoadmapItem; after?: RoadmapItem; status: "unchanged" | "changed" | "added" | "removed"};
export function compareRoadmapItems(before: RoadmapItem[], after: RoadmapItem[]): RoadmapDifference[] {
  const pairs = new Map<string, RoadmapItem>();
  const used = new Set<string>();
  // Stable IDs take precedence, including renamed items.
  for (const item of after) {
    const original = before.find(candidate => candidate.id === item.id);
    if (original) {pairs.set(item.id, original); used.add(original.id);}
  }
  const signature = (item: RoadmapItem) => JSON.stringify([item.kind ?? "item", item.name.trim()]);
  for (const item of after.filter(item => !pairs.has(item.id))) {
    const candidates = before.filter(candidate => !used.has(candidate.id) && signature(candidate) === signature(item));
    const targets = after.filter(candidate => !pairs.has(candidate.id) && signature(candidate) === signature(item));
    if (candidates.length === 1 && targets.length === 1) {pairs.set(item.id, candidates[0]); used.add(candidates[0].id);}
  }
  const same = (a: RoadmapItem, b: RoadmapItem) => a.name === b.name && a.kind === b.kind && a.startDate === b.startDate && a.endDate === b.endDate && (a.content ?? "") === (b.content ?? "");
  const rows: RoadmapDifference[] = after.map(item => {
    const original = pairs.get(item.id);
    return {before: original, after: item, status: !original ? "added" : same(original, item) ? "unchanged" : "changed"};
  });
  rows.push(...before.filter(item => !used.has(item.id)).map(item => ({before: item, status: "removed" as const})));
  return rows.sort((a, b) => (a.after ?? a.before)!.startDate.localeCompare((b.after ?? b.before)!.startDate));
}
