"use client";

import { useRef, useState } from "react";
import type { RoadmapIdentity } from "@/types/roadmaps";
import { comparisonFields, comparisonBuilds } from "./comparison-selection";
import { RoadmapOverlay } from "./roadmap-overlay";
import { captureTimelines, downloadTimeline, type TimelineImage } from "./timeline-export";

export function ComparisonResults({baseline, target, baselineBuilds, targetBuilds}: {
  baseline: RoadmapIdentity; target: RoadmapIdentity; baselineBuilds: string[]; targetBuilds: string[];
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [preview, setPreview] = useState<TimelineImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const builds = comparisonBuilds(baselineBuilds, targetBuilds);
  const selected = builds.filter(({build}) => checked.includes(build)).map(({build}) => build);
  const all = builds.length > 0 && selected.length === builds.length;
  const label = (value: RoadmapIdentity) => comparisonFields.map(field => value[field]).join(" · ");
  const heading = `기준: ${label(baseline)} / 비교 대상: ${label(target)}`;
  return <div className="comparison-results" ref={root}>
    <h3 className="comparison-baseline-heading">기준 · {label(baseline)}</h3>
    <div className="comparison-target-heading">
      <h3>비교 대상 : {label(target)}</h3>
      <div className="comparison-color-legend" aria-label="비교 색상 안내">
        <span className="legend-target">파랑 : 동일</span><span className="legend-changed">주황 : 변경</span><span className="legend-added">녹색 : 추가</span>
      </div>
      <button type="button" className="timeline-download" disabled={!selected.length || busy} onClick={async () => {
        if (!root.current) return;
        setPreview(null); setError(""); setBusy(true); dialog.current?.showModal();
        try {setPreview(await captureTimelines(root.current, selected, heading));}
        catch (reason) {setError(reason instanceof Error ? reason.message : "미리보기 생성에 실패했습니다.");}
        finally {setBusy(false);}
      }}>Download</button>
    </div>
    {!!builds.length && <label className="timeline-check timeline-check-all"><input type="checkbox" checked={all}
      ref={node => {if (node) node.indeterminate = !!selected.length && !all;}}
      onChange={event => setChecked(event.target.checked ? builds.map(({build}) => build) : [])} /><span>모든 Build</span></label>}
    {builds.map(({build, inBaseline, inTarget}) => <section key={build} data-export-build={build} aria-label={`${build} 비교`}>
      <label className="timeline-check"><input type="checkbox" aria-label={`${build} 비교 다운로드 선택`} checked={checked.includes(build)}
        onChange={event => setChecked(current => event.target.checked ? [...current, build] : current.filter(value => value !== build))} />
        <span>{build}{!inBaseline ? " · 비교 대상에만 있음" : !inTarget ? " · 기준에만 있음" : ""}</span></label>
      <RoadmapOverlay baseline={{...baseline, build}} target={{...target, build}} inBaseline={inBaseline} inTarget={inTarget} />
    </section>)}
    {!builds.length && <p role="status">비교할 Build가 없습니다.</p>}
    <dialog ref={dialog} className="option-dialog timeline-download-dialog" aria-labelledby="comparison-download-title" onCancel={event => {if (busy) event.preventDefault();}}>
      <div className="option-dialog-header"><h2 id="comparison-download-title">비교 결과 다운로드</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button></div>
      {busy && <p role="status">파일을 준비하고 있습니다.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {preview && <img className="timeline-download-preview" src={preview.dataUrl} alt="선택한 Build 비교 결과 미리보기" />}
      <div className="comparison-actions">{(["png", "pptx"] as const).map(format => <button key={format} type="button" disabled={!preview || busy} onClick={async () => {
        if (!preview || busy) return;
        setBusy(true); setError("");
        try {await downloadTimeline(preview, format, `Product Forecast 비교 ${heading}`);}
        catch (reason) {setError(reason instanceof Error ? reason.message : "다운로드에 실패했습니다.");}
        finally {setBusy(false);}
      }}>{format.toUpperCase()} 다운로드</button>)}</div>
      <p className="overlay-note">PPTX는 도형·텍스트를 편집할 수 있으며 전체와 Build별로 그룹화됩니다.</p>
    </dialog>
  </div>;
}
