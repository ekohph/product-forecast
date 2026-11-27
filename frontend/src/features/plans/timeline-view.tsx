"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoadmapCatalog, RoadmapIdentity, RoadmapRecord } from "@/types/roadmaps";
import type { RoadmapMonth } from "./roadmap-months";
import { getRoadmap } from "@/lib/api";
import { buildProductTimeline } from "./product-timeline";
import { RoadmapTimeline } from "./roadmap-timeline";
import { sortRoadmapItems } from "./roadmap-items";
import { captureTimelines, downloadTimeline, type TimelineImage } from "./timeline-export";

export function TimelineView({selection, options, ready, months}: {selection: RoadmapIdentity; options: RoadmapCatalog; ready: boolean; months: RoadmapMonth[]}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [preview, setPreview] = useState<TimelineImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
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
  const heading = `${product} · ${phase} · Version ${version}`;
  const valid = ready && product && phase && version && months.length;
  return <>
    <div className="roadmap-heading view-heading"><h2>{product || "제품 없음"}</h2><span>{phase || "Phase 없음"} · Version {version}</span>
      <button type="button" className="timeline-download" disabled={!valid || !exportKeys.length || busy} onClick={async () => {
        if (!root.current || !exportKeys.length) return;
        setError(""); setPreview(null); setBusy(true); dialog.current?.showModal();
        try {setPreview(await captureTimelines(root.current, exportKeys, heading, exportLabels));}
        catch (reason) {setError(reason instanceof Error ? reason.message : "미리보기를 만들지 못했습니다.");}
        finally {setBusy(false);}
      }}>Download</button>
    </div>
    {!valid ? <p role="status">제품·Phase·Version과 저장소 연결을 확인해 주세요.</p> : !options.build.length ? <p role="status">Build를 추가해 주세요.</p> : <div ref={root} className="build-timelines">
      <div data-export-build={overviewKey} className="selectable-timeline product-timeline-overview">
        <label className="timeline-check">
          <input type="checkbox" aria-label={`${product} 전체 타임라인 다운로드 선택`} disabled={!overviewReady} checked={overviewReady && overviewChecked}
            onChange={event => setOverviewChecked(event.target.checked)} />
          <span>{product}</span>
        </label>
        {overviewReady ? <RoadmapTimeline months={timeline.months} items={timeline.items} build={`${product} 전체`} compact showBuildLabel={false} />
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
            <RoadmapTimeline months={timeline.months} items={sortRoadmapItems(timeline.itemsByBuild.get(build) ?? [], result.record.data?.sort ?? "Start Date (Ascending)")} build={build} compact showBuildLabel={false} />
          </section> : <section className="timeline-status-row" aria-label={`${build} 타임라인 상태`}>
            <div><p role={result?.error ? "alert" : "status"}>{result?.error ?? "저장된 로드맵을 불러오고 있습니다."}</p>
              {result?.error && <button type="button" onClick={() => setAttempt(current => current + 1)}>다시 시도</button>}</div>
          </section>}
        </div>;
      })}
    </div>}
    <dialog ref={dialog} className="option-dialog timeline-download-dialog" aria-labelledby="timeline-download-title" onCancel={event => {if (busy) event.preventDefault();}}>
      <div className="option-dialog-header"><h2 id="timeline-download-title">타임라인 다운로드</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button></div>
      {busy && <p role="status">파일을 준비하고 있습니다.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {preview && <img className="timeline-download-preview" src={preview.dataUrl} alt="선택된 타임라인 다운로드 미리보기" />}
      <div className="comparison-actions">
        {(["png", "pptx"] as const).map(format => <button key={format} type="button" disabled={!preview || busy} onClick={async () => {
          if (!preview || busy) return;
          setBusy(true); setError("");
          try {await downloadTimeline(preview, format, `Product Forecast ${heading}`);}
          catch (reason) {setError(reason instanceof Error ? reason.message : "다운로드에 실패했습니다.");}
          finally {setBusy(false);}
        }}>{format.toUpperCase()} 다운로드</button>)}
        <span className="overlay-note">PPTX는 도형·텍스트를 편집할 수 있으며, 전체와 타임라인별로 그룹화됩니다.</span>
      </div>
    </dialog>
  </>;
}
