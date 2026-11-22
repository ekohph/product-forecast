"use client";

import { useEffect, useRef, useState } from "react";
import type { RoadmapMonth } from "./roadmap-months";
import { roadmapTimelineTicks, roadmapToday, itemPosition, daysInMonth, type RoadmapItem } from "./roadmap-items";
import { layoutTimelineLabels, layoutTimelineRanges, timelineLaneOffset } from "./timeline-labels";

export function RoadmapTimeline({months, items, build, compact = false, showBuildLabel = true}: {months: RoadmapMonth[]; items: RoadmapItem[]; build: string; compact?: boolean; showBuildLabel?: boolean}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [today, setToday] = useState("");
  useEffect(() => {
    const refresh = () => setToday(roadmapToday(new Date()));
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {window.clearInterval(timer); window.removeEventListener("focus", refresh);};
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [months.length > 0]);
  const ticks = roadmapTimelineTicks(months, items);
  if (!months.length) return null;
  const inset = Math.min(42, width / 4), usable = Math.max(1, width - inset * 2);
  // Shift date text, while ticks remain at their exact dates.
  const dateLabels = layoutTimelineLabels(ticks.map(tick => ({x: inset + tick.position * usable, width: tick.label.length * 7})), width);
  const nameRows: number[] = [];
  function place(rows: number[], left: number, right: number) {
    let row = rows.findIndex(end => end + 8 < left);
    if (row < 0) row = rows.length;
    rows[row] = right;
    return row;
  }
  const points = ticks.map((tick, index) => {
    const x = inset + tick.position * usable;
    const {x: labelX, row: dateRow} = dateLabels[index];
    const names = tick.milestones.map(milestone => {
      const name = milestone.name.length > 22 ? `${milestone.name.slice(0, 21)}…` : milestone.name;
      const textWidth = Math.min(176, name.length * 8);
      const left = Math.max(0, Math.min(x - textWidth / 2, width - textWidth));
      return {name, left, row: place(nameRows, left, left + textWidth)};
    });
    return {...tick, x, labelX, dateRow, names};
  });
  const ranges = items.filter(item => item.kind !== "milestone").flatMap(item => {
    const position = itemPosition(item, months);
    if (!position) return [];
    const start = inset + position.left / 100 * usable;
    const endMonth = months.find(month => month.key === item.endDate.slice(0, 7));
    const end = inset + (position.left + position.width) / 100 * usable
      - (endMonth ? usable / months.length / daysInMonth(endMonth.key) : 0);
    return [{item, start, end, center: (start + end) / 2}];
  }).sort((a, b) => a.center - b.center).map(({item, start, end, center}) => {
    const name = item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name;
    return {item, name, start, end, center, labelWidth: name.length * 8};
  });
  const rangeLanes = layoutTimelineRanges(ranges.map(range => ({...range, labelWidth: 0})), 0);
  const rangeOffsets = rangeLanes.map(lane => timelineLaneOffset(lane));
  const rangeAbove = -Math.min(0, ...rangeOffsets);
  const rangeNames = ranges.map(({center, labelWidth}) => place(nameRows, center - labelWidth / 2, center + labelWidth / 2));
  const rowStep = compact ? 16 : 20;
  const lineY = (compact ? 10 : 20) + (dateLabels.length ? Math.max(...dateLabels.map(label => label.row)) + 1 : 0) * rowStep + rangeAbove;
  const nameOffset = compact ? 18 : 25;
  const rangeDepth = Math.max(0, ...rangeOffsets);
  const namesY = lineY + rangeDepth + 18;
  const height = namesY + Math.max(0, nameRows.length - 1) * 14 + 7;
  return <div className={`roadmap-timeline${compact ? " compact-timeline" : ""}${!showBuildLabel ? " timeline-without-build" : ""}`} role="region" aria-label={`${build} 일정 타임라인`}>
    <div ref={container} className="timeline-plot"><svg width="100%" height={height} role="img" aria-label={`${build} 일정과 마일스톤 타임라인`}>
      <line x1={inset} y1={lineY} x2={width - inset} y2={lineY} className="timeline-axis" />
      {points.map(point => <g key={point.date}>
        <title>{[point.date, ...point.events, ...point.milestones.map(item => item.content).filter(Boolean)].join("\n")}</title>
        <line x1={point.x} x2={point.x} y1={lineY - 7} y2={lineY + 7} className="timeline-tick" />
        {(Math.abs(point.labelX - point.x) > 4 || rangeAbove > 0) && <line x1={point.x} y1={lineY - 7} x2={point.labelX} y2={lineY - rangeAbove - 10 - point.dateRow * rowStep} className="timeline-tick" strokeDasharray="3 3" />}
        {point.label && <text x={point.labelX} y={lineY - rangeAbove - 12 - point.dateRow * rowStep} textAnchor="middle" className="timeline-date">{point.label}</text>}
        {point.milestones.length > 0 && <circle cx={point.x} cy={lineY} r={6} className={`timeline-milestone${today && point.date < today ? " past" : " upcoming"}`} />}
        {point.names.map((name, index) => <text key={point.milestones[index].id} x={name.left} y={namesY + name.row * 14} className="timeline-name">{name.name}</text>)}
      </g>)}
      {ranges.map(({item, name, start, end, center}, index) => {
        const y = lineY + rangeOffsets[index];
        const head = Math.min(6, Math.max(0, end - start) / 2);
        return <g key={item.id}>
          <title>{`${item.name}: ${item.startDate} ~ ${item.endDate}`}</title>
          <line x1={start} y1={y} x2={end} y2={y} className="timeline-item-line" />
          {[{x: start, direction: 1}, {x: end, direction: -1}].map(({x, direction}) => <g key={direction}>
            <line x1={x} x2={x} y1={y - 7} y2={y + 7} className="timeline-tick" />
            <g className="timeline-arrowhead">
              <line x1={x + direction * head} y1={y - 5} x2={x} y2={y} />
              <line x1={x + direction * head} y1={y + 5} x2={x} y2={y} />
            </g>
          </g>)}
          <text x={center} y={namesY + rangeNames[index] * 14} textAnchor="middle" className="timeline-item-name">{name}</text>
        </g>;
      })}
      {compact && !ticks.length && <text x={inset} y={lineY + nameOffset} className="timeline-empty">표시할 일정이 없습니다.</text>}
    </svg></div>
    {compact && showBuildLabel && <h3 className="timeline-build-name" style={{marginTop: lineY - 9}} title={build}>{build}</h3>}
  </div>;
}
