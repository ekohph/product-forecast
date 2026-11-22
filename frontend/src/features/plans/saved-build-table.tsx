"use client";

import { useCallback, useEffect, useState } from "react";
import { getRoadmap, saveRoadmap } from "@/lib/api";
import type { RoadmapIdentity, RoadmapRecord } from "@/types/roadmaps";
import type { RoadmapMonth } from "./roadmap-months";
import { BuildTable, type RoadmapTableData } from "./build-table";
import { RoadmapTimeline } from "./roadmap-timeline";
import { sortRoadmapItems } from "./roadmap-items";

export type BuildDraft = {build: string; revision: number; data: RoadmapTableData; blocked: boolean; dirty: boolean};
export function SavedBuildTable({identity, months, selected, mode, showBuildLabel = true, onDraft}: {identity: RoadmapIdentity; months: RoadmapMonth[]; selected: boolean; mode: "view" | "edit"; showBuildLabel?: boolean; onDraft?: (build: string, draft: BuildDraft | null) => void}) {
  const [record, setRecord] = useState<RoadmapRecord | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const {product, build, phase, version} = identity;
  const reportDraft = useCallback((data: RoadmapTableData, blocked: boolean, dirty: boolean) => {
    if (record) onDraft?.(build, {build, data, revision: record.revision, blocked, dirty});
  }, [build, record, onDraft]);
  useEffect(() => {
    onDraft?.(build, null);
    return () => onDraft?.(build, null);
  }, [build, attempt, onDraft]);
  useEffect(() => {
    let active = true;
    setError(""); setRecord(null);
    getRoadmap({product, build, phase, version}).then(result => {
      if (active) setRecord(result);
    }).catch((reason: Error) => {if (active) setError(reason.message);});
    return () => {active = false;};
  }, [product, build, phase, version, attempt]);

  async function save(data: RoadmapTableData) {
    if (!record) throw new Error("로드맵을 먼저 불러와 주세요.");
    const saved = await saveRoadmap(identity, data, record.revision);
    setRecord(saved);
  }
  if (mode === "view" && (error || !record)) return <section className="timeline-status-row" aria-label={`${build} 타임라인 상태`}>
    <div><p role={error ? "alert" : "status"}>{error || "저장된 로드맵을 불러오고 있습니다."}</p>
      {error && <button onClick={() => setAttempt(current => current + 1)}>다시 시도</button>}</div>{showBuildLabel && <h3>{build}</h3>}
  </section>;
  if (error) return <section className="panel" aria-label={`${build} 로드맵 불러오기 오류`}><h3>{build}</h3><p role="alert" className="error">{error}</p><button onClick={() => setAttempt(current => current + 1)}>다시 시도</button></section>;
  if (!record) return <section className="panel"><h3>{build}</h3><p role="status">저장된 로드맵을 불러오고 있습니다.</p></section>;
  if (mode === "view") {
    const visibleMonths = record.data?.months ?? months;
    const items = sortRoadmapItems(record.data?.items ?? [], record.data?.sort ?? "Start Date (Ascending)");
    return <section className="build-timeline-row" aria-label={`${product} ${build} 타임라인`}>
      <RoadmapTimeline months={visibleMonths} items={items} build={build} compact showBuildLabel={showBuildLabel} />
      {!visibleMonths.length && <div className="timeline-status-row"><p>표시할 월이 없습니다.</p>{showBuildLabel && <h3>{build}</h3>}</div>}
    </section>;
  }
  return <BuildTable product={product} build={build} months={months} selected={selected} data={record.data ?? undefined} updatedAt={record.updated_at} onChange={save} onDraft={reportDraft}
    onCancel={() => setAttempt(current => current + 1)} />;
}
