import type { RoadmapMonth } from "./roadmap-months";

export type RoadmapItem = { id: string; name: string; startDate: string; endDate: string; kind?: "milestone"; content?: string };
export const roadmapSortOptions = ["Start Date (Ascending)", "End Date (Ascending)", "Milestone Date (Ascending)", "Start Date (Descending)", "End Date (Descending)", "Milestone Date (Descending)"] as const;
export type RoadmapSort = typeof roadmapSortOptions[number];
export function sortRoadmapItems(items: RoadmapItem[], sort: RoadmapSort): RoadmapItem[] {
  const date = (item: RoadmapItem) => sort.startsWith("Milestone")
    ? (item.kind === "milestone" ? item.startDate : null)
    : sort.startsWith("End") ? item.endDate : item.startDate;
  return [...items].sort((a, b) => {
    const left = date(a), right = date(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return left.localeCompare(right) * (sort.endsWith("(Descending)") ? -1 : 1);
  });
}
export function moveItem(item: RoadmapItem, days: number, min: string, max: string): RoadmapItem {
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const start = time(item.startDate), end = time(item.endDate), day = 86400000;
  // Existing partially hidden items may stay outside the visible range, but
  // movement cannot push them farther out or change their duration.
  const lower = Math.min(time(min), start), upper = Math.max(time(max), end);
  const delta = Math.max(lower - start, Math.min(upper - end, Math.round(days) * day));
  return {...item, startDate: new Date(start + delta).toISOString().slice(0, 10), endDate: new Date(end + delta).toISOString().slice(0, 10)};
}
export function moveItemsTogether(items: RoadmapItem[], days: number, min: string, max: string): RoadmapItem[] {
  // Clamp the group once, so an item hitting a boundary never changes the gaps.
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
  const lower = Math.max(...items.map(item => Math.min(0, time(min) - time(item.startDate))));
  const upper = Math.min(...items.map(item => Math.max(0, time(max) - time(item.endDate))));
  const delta = Math.max(lower, Math.min(upper, Math.round(days)));
  return items.map(item => moveItem(item, delta, min, max));
}
export function daysInMonth(key: string): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function monthRange(key: string) {
  return {startDate: `${key}-01`, endDate: `${key}-${daysInMonth(key)}`};
}
export function roadmapTimelineTicks(months: RoadmapMonth[], items: RoadmapItem[]) {
  const dates = new Map<string, {events: string[]; milestones: RoadmapItem[]; starts: boolean; ends: boolean}>();
  const add = (date: string, event?: string, milestone?: RoadmapItem, edge?: "start" | "end") => {
    if (!months.some(month => month.key === date.slice(0, 7))) return;
    const tick = dates.get(date) ?? {events: [], milestones: [], starts: false, ends: false};
    if (event) tick.events.push(event);
    if (milestone) tick.milestones.push(milestone);
    if (edge === "start") tick.starts = true;
    if (edge === "end") tick.ends = true;
    dates.set(date, tick);
  };
  for (const item of items) {
    if (item.kind === "milestone") add(item.startDate, item.name, item);
    else {add(item.startDate, `${item.name} 시작`, undefined, "start"); add(item.endDate, `${item.name} 종료`, undefined, "end");}
  }
  let previousYear = "";
  return [...dates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, details]) => {
    const year = date.slice(0, 4), key = date.slice(0, 7);
    const label = `${details.milestones.length && year !== previousYear ? `'${year.slice(-2)} ` : ""}${date.slice(5).replace("-", "/")}`;
    if (details.milestones.length) previousYear = year;
    const position = (months.findIndex(month => month.key === key) + (Number(date.slice(8)) - 1) / daysInMonth(key)) / months.length;
    return {date, label, position, ...details};
  });
}
export function roadmapToday(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export function dateAtPosition(months: RoadmapMonth[], position: number, edge: "start" | "end"): string {
  const bounded = Math.max(0, Math.min(months.length, position));
  const index = Math.min(months.length - 1, Math.floor(bounded));
  // End dates are inclusive: the boundary at the next month belongs to the preceding day.
  if (edge === "end" && bounded > 0 && Number.isInteger(bounded)) return monthRange(months[bounded - 1].key).endDate;
  const month = months[index].key;
  const days = daysInMonth(month);
  const fraction = bounded - index;
  const day = Math.max(1, Math.min(days, edge === "start" ? Math.floor(fraction * days) + 1 : Math.ceil(fraction * days)));
  return `${month}-${String(day).padStart(2, "0")}`;
}
export function itemPosition(item: RoadmapItem, months: RoadmapMonth[]) {
  const visible = months.map((month, index) => ({...monthRange(month.key), key: month.key, index}))
    .filter(month => month.endDate >= item.startDate && month.startDate <= item.endDate);
  if (!visible.length) return null;
  const first = visible[0], last = visible[visible.length - 1];
  const start = item.startDate > first.startDate ? (Number(item.startDate.slice(8)) - 1) / daysInMonth(first.key) : 0;
  const end = item.endDate < last.endDate ? Number(item.endDate.slice(8)) / daysInMonth(last.key) : 1;
  return {left: (first.index + start) / months.length * 100, width: (last.index + end - first.index - start) / months.length * 100};
}
export function resizeItem(item: RoadmapItem, edge: "start" | "end", date: string): RoadmapItem {
  return edge === "start" ? {...item, startDate: date > item.endDate ? item.endDate : date}
    : {...item, endDate: date < item.startDate ? item.startDate : date};
}
