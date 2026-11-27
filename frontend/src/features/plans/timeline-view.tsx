"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoadmapCatalog, RoadmapIdentity, RoadmapRecord } from "@/types/roadmaps";
import type { RoadmapMonth } from "./roadmap-months";
import { getRoadmap } from "@/lib/api";
import { buildProductTimeline } from "./product-timeline";
import { RoadmapTimeline, type TimelineSizes } from "./roadmap-timeline";
import { sortRoadmapItems } from "./roadmap-items";
import { TimelineDisplayOptions, TimelineDownload } from "./timeline-controls";

export function TimelineView({selection, options, ready, months, sizes, onSizes}: {
  selection: RoadmapIdentity; options: RoadmapCatalog; ready: boolean; months: RoadmapMonth[];
  sizes: TimelineSizes; onSizes: (sizes: TimelineSizes) => void;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [overviewChecked, setOverviewChecked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{key: string; results: Map<string, {record?: RoadmapRecord; error?: string}>} | null>(null);
  const {product, phase, version} = selection;
  const buildKey = JSON.stringify(options.build);
  const requestKey = JSON.stringify([product, phase, version, buildKey, attempt]);
  useEffect(() => {
    if (!ready || !product || !phase || !version) return;
    let active = true;
    const builds = JSON.parse(buildKey) as string[];
    Promise.all(builds.map(async build => {
      try {return [build, {record: await getRoadmap({product, phase, version, build})}] as const;}
      catch (reason) {return [build, {error: reason instanceof Error ? reason.message : "로드맵을 불러오지 못했습니다."}] as const;}
    })).then(entries => {
      if (active) setLoad({key: requestKey, results: new Map<string, {record?: RoadmapRecord; error?: string}>(entries)});
    });
    return () => {active = false;};
  }, [ready, product, phase, version, buildKey, requestKey]);

  const results = load?.key === requestKey ? load.results : null;
  const timeline = useMemo(() => buildProductTimeline(Array.from(results ?? []).map(([build, {record}]) => ({
    build, months: record?.data?.months ?? [], items: record?.data?.items ?? [],
  })), months), [months, results]);
  const failed = results ? Array.from(results.values()).some(result => !!result.error) : false;
  const overviewReady = !!results && !failed;
  const overviewKey = "overview";
  const buildRowKey = (build: string) => JSON.stringify(["build", build]);
  const availableBuilds = options.build.filter(build => !!results?.get(build)?.record);
  const builds = availableBuilds.filter(build => checked.includes(build));
  const allChecked = availableBuilds.length > 0 && builds.length === availableBuilds.length;
  const partiallyChecked = builds.length > 0 && !allChecked;
  const exportKeys = [...(overviewReady && overviewChecked ? [overviewKey] : []), ...builds.map(buildRowKey)];
  const exportLabels = new Map([[overviewKey, product], ...builds.map(build => [buildRowKey(build), build] as const)]);
  const valid = ready && product && phase && version && months.length;
  return <>
    <div className="roadmap-heading view-heading"><h2>{product || "제품 없음"}</h2><span className="timeline-phase" style={{fontSize: sizes.phase}}>{phase || "Phase 없음"}</span><span>· Version {version}</span>
      <TimelineDisplayOptions sizes={sizes} onSizes={onSizes} />
      <TimelineDownload root={root} selected={exportKeys} labels={exportLabels} title={product}
        phase={phase} version={version} phaseSize={sizes.phase} disabled={!valid} />
    </div>
    {!valid ? <p role="status">제품·Phase·Version과 저장소 연결을 확인해 주세요.</p> : !options.build.length ? <p role="status">Build를 추가해 주세요.</p> : <div ref={root} className="build-timelines">
      <div data-export-build={overviewKey} className="selectable-timeline product-timeline-overview">
        <label className="timeline-check">
          <input type="checkbox" aria-label={`${product} 전체 타임라인 다운로드 선택`} disabled={!overviewReady} checked={overviewReady && overviewChecked}
            onChange={event => setOverviewChecked(event.target.checked)} />
          <span>{product}</span>
        </label>
        {overviewReady ? <RoadmapTimeline months={timeline.months} items={timeline.items} build={`${product} 전체`} compact showBuildLabel={false} sizes={sizes} />
          : <div className="timeline-status-row"><p role={failed ? "alert" : "status"}>{failed ? "일부 Build를 불러오지 못해 전체 일정을 표시할 수 없습니다." : "전체 일정을 불러오고 있습니다."}</p></div>}
      </div>
      <label className="timeline-check timeline-check-all">
        <input type="checkbox" checked={allChecked} disabled={!availableBuilds.length}
          ref={element => {if (element) element.indeterminate = partiallyChecked;}}
          onChange={event => setChecked(event.target.checked ? availableBuilds : [])} />
        <span>모든 Build</span>
      </label>
      {options.build.map(build => {
        const result = results?.get(build);
        return <div key={build} data-export-build={buildRowKey(build)} className="selectable-timeline">
          <label className="timeline-check"><input type="checkbox" aria-label={`${build} 타임라인 다운로드 선택`} disabled={!result?.record}
            checked={builds.includes(build)} onChange={event => setChecked(current => event.target.checked ? [...current, build] : current.filter(value => value !== build))} /><span>{build}</span></label>
          {result?.record ? <section className="build-timeline-row" aria-label={`${product} ${build} 타임라인`}>
            <RoadmapTimeline months={timeline.months} items={sortRoadmapItems(timeline.itemsByBuild.get(build) ?? [], result.record.data?.sort ?? "Start Date (Ascending)")} build={build} compact showBuildLabel={false} sizes={sizes} />
          </section> : <section className="timeline-status-row" aria-label={`${build} 타임라인 상태`}>
            <div><p role={result?.error ? "alert" : "status"}>{result?.error ?? "저장된 로드맵을 불러오고 있습니다."}</p>
              {result?.error && <button type="button" onClick={() => setAttempt(current => current + 1)}>다시 시도</button>}</div>
          </section>}
        </div>;
      })}
    </div>}
  </>;
}
