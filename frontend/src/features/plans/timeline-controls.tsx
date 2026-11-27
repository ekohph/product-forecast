"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { defaultTimelineSizes, type TimelineSizes } from "./roadmap-timeline";
import { captureTimelines, downloadTimeline, type TimelineImage } from "./timeline-export";

const sizeControls = [
  {key: "circle", label: "마일스톤 원", min: 6, max: 22},
  {key: "date", label: "날짜 글자", min: 8, max: 20},
  {key: "phase", label: "Phase 글자", min: 10, max: 24},
  {key: "item", label: "항목 글자", min: 8, max: 20},
] as const;

export function TimelineDisplayOptions({sizes, onSizes}: {sizes: TimelineSizes; onSizes: (sizes: TimelineSizes) => void}) {
  return <details className="timeline-display-options">
    <summary>표시 크기</summary>
    <div className="timeline-size-controls">
      {sizeControls.map(({key, label, min, max}) => <label key={key}>
        <span>{label}</span>
        <input type="range" aria-label={label} min={min} max={max} value={sizes[key]}
          onChange={event => onSizes({...sizes, [key]: Number(event.currentTarget.value)})} />
        <output>{sizes[key]} px</output>
      </label>)}
      <button type="button" onClick={() => onSizes(defaultTimelineSizes)}>기본값</button>
    </div>
  </details>;
}

export function TimelineDownload({root, selected, labels, title, phase, version, phaseSize, disabled}: {
  root: RefObject<HTMLDivElement | null>; selected: string[]; labels?: ReadonlyMap<string, string>;
  title: string; phase: string; version: string; phaseSize: number; disabled?: boolean;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<TimelineImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = `${title} · ${phase} · Version ${version}`;
  return <>
    <button type="button" className="timeline-download" disabled={disabled || !selected.length || busy} onClick={async () => {
      if (!root.current || !selected.length) return;
      setError(""); setPreview(null); setBusy(true); dialog.current?.showModal();
      try {setPreview(await captureTimelines(root.current, selected, heading, labels, [
        {text: title + " · ", size: 16}, {text: phase, size: phaseSize}, {text: " · Version " + version, size: 16},
      ]));}
      catch (reason) {setError(reason instanceof Error ? reason.message : "미리보기를 만들지 못했습니다.");}
      finally {setBusy(false);}
    }}>Download</button>
    <dialog ref={dialog} className="option-dialog timeline-download-dialog" aria-labelledby={id} onCancel={event => {if (busy) event.preventDefault();}}>
      <div className="option-dialog-header"><h2 id={id}>타임라인 다운로드</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>닫기</button></div>
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
