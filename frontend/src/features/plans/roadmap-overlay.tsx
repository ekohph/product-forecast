"use client";

import { useEffect, useRef, useState } from "react";
import { getRoadmap } from "@/lib/api";
import type { RoadmapIdentity, RoadmapRecord } from "@/types/roadmaps";
import { compareRoadmapItems } from "./roadmap-diff";
import { monthRange, type RoadmapItem } from "./roadmap-items";

const statusLabels = {unchanged: "동일", changed: "변경", added: "추가", removed: "삭제"};
const describe = (item?: RoadmapItem) => item ? `${item.name} · ${item.startDate}${item.kind === "milestone" ? "" : ` ~ ${item.endDate}`}\n${item.content ?? ""}` : "없음";

export function RoadmapOverlay({baseline, target, inBaseline = true, inTarget = true}: {baseline: RoadmapIdentity; target: RoadmapIdentity; inBaseline?: boolean; inTarget?: boolean}) {
  const [records, setRecords] = useState<[RoadmapRecord, RoadmapRecord] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(800);
  const container = useRef<HTMLDivElement>(null);
  const baselineKey = JSON.stringify(baseline), targetKey = JSON.stringify(target);
  useEffect(() => {
    let active = true;
    setRecords(null); setError("");
    const empty: RoadmapRecord = {revision: 0, data: null, updated_at: null};
    Promise.all([inBaseline ? getRoadmap(JSON.parse(baselineKey)) : Promise.resolve(empty), inTarget ? getRoadmap(JSON.parse(targetKey)) : Promise.resolve(empty)])
      .then(result => {if (active) setRecords(result);})
      .catch(reason => {if (active) setError(reason instanceof Error ? reason.message : "로드맵을 불러오지 못했습니다.");});
    return () => {active = false;};
  }, [baselineKey, targetKey, attempt, inBaseline, inTarget]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [records]);
  if (error) return <p role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>다시 시도</button></p>;
  if (!records) return <p role="status">비교할 로드맵을 불러오고 있습니다.</p>;
  if (records.every(record => record.data === null)) return <p role="status">양쪽 모두 저장된 로드맵이 없습니다.</p>;
  const [before, after] = records.map(record => record.data ?? {months: [], items: []});
  const rows = compareRoadmapItems(before.items, after.items);
  const dates = [...before.items, ...after.items].flatMap(item => [item.startDate, item.endDate]);
  for (const month of [...before.months, ...after.months]) {const range = monthRange(month.key); dates.push(range.startDate, range.endDate);}
  dates.sort();
  if (!dates.length) return <p role="status">두 로드맵 모두 표시할 일정과 월이 없습니다.</p>;
  const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const start = time(dates[0]), end = time(dates.at(-1)!);
  const labelWidth = Math.min(150, width * .28), right = Math.max(labelWidth + 1, width - 42);
  const x = (date: string) => labelWidth + (time(date) - start) / Math.max(86400000, end - start) * (right - labelWidth);
  const counts = rows.reduce((result, row) => ({...result, [row.status]: result[row.status] + 1}), {unchanged: 0, changed: 0, added: 0, removed: 0});
  function draw(item: RoadmapItem | undefined, y: number, background: boolean, status: string) {
    if (!item) return null;
    const className = background ? `overlay-baseline ${status === "removed" ? "overlay-removed" : ""}` : `overlay-target overlay-${status}`;
    return <g className={className}>
      {item.kind === "milestone" ? <circle cx={x(item.startDate)} cy={y} r={background ? 7 : 4} /> : <>
        <line x1={x(item.startDate)} x2={x(item.endDate)} y1={y} y2={y} strokeWidth={background ? 9 : 4} />
        {[item.startDate, item.endDate].map((date, index) => <line key={index} x1={x(date)} x2={x(date)} y1={y - 7} y2={y + 7} strokeWidth={background ? 3 : 1.5} />)}
      </>}
    </g>;
  }
  return <div className="roadmap-overlay" ref={container}>
    {records.some(record => record.data === null) && <p className="overlay-note">{records[0].data === null ? "비교 대상에만 저장된 내용이 있습니다." : "기준에만 저장된 내용이 있습니다."}</p>}
    <div className="overlay-legend" aria-label="비교 결과 건수"><span className="legend-target">유지 {counts.unchanged}</span><span className="legend-changed">변경 {counts.changed}</span><span className="legend-added">추가 {counts.added}</span><span className="legend-removed">삭제(점선) {counts.removed}</span></div>
    <svg width="100%" height={42 + rows.length * 38} role="img" aria-label="기준과 비교 대상 로드맵 중첩 및 차이">
      <line x1={labelWidth} x2={right} y1={24} y2={24} stroke="#9ca3af" />
      {[0, .5, 1].map(fraction => {
        const date = new Date(start + fraction * (end - start)).toISOString().slice(0, 10);
        return <g key={fraction}><text x={x(date)} y={14} textAnchor="middle" className="timeline-date">{`'${date.slice(2, 4)} ${date.slice(5).replace("-", "/")}`}</text><line x1={x(date)} x2={x(date)} y1={20} y2={30} stroke="#9ca3af" /></g>;
      })}
      {rows.map((row, index) => {
        const item = (row.after ?? row.before)!, y = 48 + index * 38;
        return <g key={`${row.before?.id ?? ""}/${row.after?.id ?? ""}`}>
          <title>{`${statusLabels[row.status]}\n기준: ${describe(row.before)}\n대상: ${describe(row.after)}`}</title>
          <text x={4} y={y + 4} className="timeline-item-name">{`${statusLabels[row.status]} · ${item.name.length > 12 ? `${item.name.slice(0, 11)}…` : item.name}`}</text>
          <line x1={labelWidth} x2={right} y1={y} y2={y} stroke="#f0f1f3" />
          {draw(row.before, y, true, row.status)}
          {row.before && row.after && row.status === "changed" && (["startDate", "endDate"] as const).map((field, edge) => row.before![field] !== row.after![field] && <line key={field} x1={x(row.before![field])} x2={x(row.after![field])} y1={y + (edge ? 11 : -11)} y2={y + (edge ? 11 : -11)} className="overlay-date-shift" />)}
          {draw(row.after, y, false, row.status)}
        </g>;
      })}
    </svg>
    {!rows.length && <p role="status">두 로드맵 모두 등록된 일정이 없습니다.</p>}
    <p className="overlay-note">같은 ID를 우선 대응하며, ID가 다르면 종류와 이름이 유일하게 일치하는 항목을 대응합니다. 중복 이름은 임의로 연결하지 않습니다. 마우스를 올리면 변경 전·후 날짜와 내용을 볼 수 있습니다.</p>
  </div>;
}
