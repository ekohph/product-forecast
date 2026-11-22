export type RoadmapMonth = { key: string; label: string; year: number; quarter: number };
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function getRoadmapMonths(date: Date): RoadmapMonth[] {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone: "Asia/Seoul", year: "numeric", month: "numeric"}).formatToParts(date);
  const year = Number(parts.find(part => part.type === "year")!.value);
  const month = Number(parts.find(part => part.type === "month")!.value) - 1;
  const start = year * 12 + month;
  const end = year * 12 + (Math.floor(month / 3) + 2) * 3 - 1;
  return Array.from({length: end - start + 1}, (_, index) => {
    const absolute = start + index;
    const y = Math.floor(absolute / 12);
    const m = absolute % 12;
    return {key: `${y}-${String(m + 1).padStart(2, "0")}`, label: monthNames[m], year: y, quarter: Math.floor(m / 3) + 1};
  });
}

export function shiftMonth(month: RoadmapMonth, offset: number): RoadmapMonth {
  const [year, number] = month.key.split("-").map(Number);
  const absolute = year * 12 + number - 1 + offset;
  const y = Math.floor(absolute / 12);
  const m = ((absolute % 12) + 12) % 12;
  return {key: `${y}-${String(m + 1).padStart(2, "0")}`, label: monthNames[m], year: y, quarter: Math.floor(m / 3) + 1};
}
