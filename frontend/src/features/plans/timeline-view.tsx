"use client";

import { useRef, useState } from "react";
import type { RoadmapCatalog, RoadmapIdentity } from "@/types/roadmaps";
import type { RoadmapMonth } from "./roadmap-months";
import { SavedBuildTable } from "./saved-build-table";
import { captureTimelines, downloadTimeline, type TimelineImage } from "./timeline-export";

export function TimelineView({selection, options, ready, months}: {selection: RoadmapIdentity; options: RoadmapCatalog; ready: boolean; months: RoadmapMonth[]}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [preview, setPreview] = useState<TimelineImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const builds = options.build.filter(build => checked.includes(build));
  const allChecked = options.build.length > 0 && builds.length === options.build.length;
  const partiallyChecked = builds.length > 0 && !allChecked;
  const heading = `${selection.product} · ${selection.phase} · Version ${selection.version}`;
  const valid = ready && selection.product && selection.phase && selection.version && months.length;
  return <>
    <div className="roadmap-heading view-heading"><h2>{selection.product || "제품 없음"}</h2><span>{selection.phase || "Phase 없음"} · Version {selection.version}</span>
      <button type="button" className="timeline-download" disabled={!valid || !builds.length || busy} onClick={async () => {
        if (!root.current || !builds.length) return;
        setError(""); setPreview(null); setBusy(true); dialog.current?.showModal();
        try {setPreview(await captureTimelines(root.current, builds, heading));}
        catch (reason) {setError(reason instanceof Error ? reason.message : "미리보기를 만들지 못했습니다.");}
        finally {setBusy(false);}
      }}>Download</button>
    </div>
    {!valid ? <p role="status">제품·Phase·Version과 저장소 연결을 확인해 주세요.</p> : !options.build.length ? <p role="status">Build를 추가해 주세요.</p> : <div ref={root} className="build-timelines">
      <label className="timeline-check timeline-check-all">
        <input type="checkbox" checked={allChecked}
          ref={element => {if (element) element.indeterminate = partiallyChecked;}}
          onChange={event => setChecked(event.target.checked ? [...options.build] : [])} />
        <span>모든 Build</span>
      </label>
      {options.build.map(build => <div key={build} data-export-build={build} className="selectable-timeline">
        <label className="timeline-check"><input type="checkbox" aria-label={`${build} 타임라인 다운로드 선택`} checked={checked.includes(build)} onChange={event => setChecked(current => event.target.checked ? [...current, build] : current.filter(value => value !== build))} /><span>{build}</span></label>
        <SavedBuildTable identity={{...selection, build}} months={months} selected={selection.build === build} mode="view" showBuildLabel={false} />
      </div>)}
    </div>}
    <dialog ref={dialog} className="option-dialog timeline-download-dialog" aria-labelledby="timeline-download-title" onCancel={event => {if (busy) event.preventDefault();}}>
      <div className="option-dialog-header"><h2 id="timeline-download-title">타임라인 다운로드</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button></div>
      {busy && <p role="status">파일을 준비하고 있습니다.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {preview && <img className="timeline-download-preview" src={preview.dataUrl} alt="선택된 Build 타임라인 다운로드 미리보기" />}
      <div className="comparison-actions">
        {(["png", "pptx"] as const).map(format => <button key={format} type="button" disabled={!preview || busy} onClick={async () => {
          if (!preview || busy) return;
          setBusy(true); setError("");
          try {await downloadTimeline(preview, format, `Product Forecast ${heading}`);}
          catch (reason) {setError(reason instanceof Error ? reason.message : "다운로드에 실패했습니다.");}
          finally {setBusy(false);}
        }}>{format.toUpperCase()} 다운로드</button>)}
        <span className="overlay-note">PPTX는 도형·텍스트를 편집할 수 있으며, 전체와 Build별로 그룹화됩니다.</span>
      </div>
    </dialog>
  </>;
}
