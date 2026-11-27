import { monthRange, type RoadmapItem } from "./roadmap-items.ts";
import { shiftMonth, type RoadmapMonth } from "./roadmap-months.ts";

export type BuildSchedule = {build: string; months: RoadmapMonth[]; items: RoadmapItem[]};
const days = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;

export function sharedTimelineMonths(allMonths: RoadmapMonth[], fallbackMonths: RoadmapMonth[]) {
  const storedMonths = [...allMonths].sort((a, b) => a.key.localeCompare(b.key));
  const first = storedMonths[0], last = storedMonths.at(-1);
  const months: RoadmapMonth[] = [];
  if (first && last) {
    const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5));
    const length = monthIndex(last.key) - monthIndex(first.key) + 1;
    for (let offset = 0; offset < length; offset++) {
      const month = shiftMonth(first, offset);
      months.push({...month, key: month.key.padStart(7, "0")});
    }
  } else {
    months.push(...fallbackMonths);
  }

  return months;
}

export function buildProductTimeline(schedules: BuildSchedule[], fallbackMonths: RoadmapMonth[], sharedMonths?: RoadmapMonth[]) {
  const months = sharedMonths ?? sharedTimelineMonths(schedules.flatMap(schedule => schedule.months), fallbackMonths);
  // Clip against each Build's saved month columns; a removed month must not
  // create coverage after the view switches to a continuous shared axis.
  const milestones: RoadmapItem[] = [];
  const ranges: {startDate: string; endDate: string; build: string}[] = [];
  const itemsByBuild = new Map<string, RoadmapItem[]>();
  for (const {build, months: ownMonths, items} of schedules) {
    const monthWindows = ownMonths.map(month => monthRange(month.key));
    const visible: RoadmapItem[] = [];
    for (const item of items) {
      if (item.kind === "milestone") {
        if (!monthWindows.some(window => item.startDate >= window.startDate && item.startDate <= window.endDate)) continue;
        visible.push(item);
        milestones.push({...item, id: JSON.stringify([build, item.id]), name: `${item.name} (${build})`});
        continue;
      }
      const parts: RoadmapItem[] = [];
      for (const window of monthWindows) {
        const startDate = item.startDate > window.startDate ? item.startDate : window.startDate;
        const endDate = item.endDate < window.endDate ? item.endDate : window.endDate;
        if (startDate > endDate) continue;
        const previous = parts.at(-1);
        if (previous && days(startDate) <= days(previous.endDate) + 1) previous.endDate = endDate;
        else parts.push({...item, id: JSON.stringify([item.id, startDate]), startDate, endDate});
      }
      visible.push(...parts);
      ranges.push(...parts.map(({startDate, endDate}) => ({startDate, endDate, build})));
    }
    itemsByBuild.set(build, visible);
  }

  // Union inclusive date ranges; never fill a day missing from every Build.
  ranges.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const union: {startDate: string; endDate: string; builds: Set<string>}[] = [];
  for (const {startDate, endDate, build} of ranges) {
    const previous = union.at(-1);
    if (!previous || days(startDate) > days(previous.endDate) + 1) {
      union.push({startDate, endDate, builds: new Set([build])});
    } else {
      if (endDate > previous.endDate) previous.endDate = endDate;
      previous.builds.add(build);
    }
  }
  const summary = union.map(({startDate, endDate, builds}, index) => ({
    id: `coverage-${index}`, startDate, endDate, name: [...builds].join(" · "),
  }));
  return {months, itemsByBuild, items: [...summary, ...milestones]};
}
