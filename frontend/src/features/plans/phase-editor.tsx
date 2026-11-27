"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {RoadmapCatalog, RoadmapIdentity} from "@/types/roadmaps";
import type {RoadmapMonth} from "./roadmap-months";
import {SavedBuildTable, type BuildDraft} from "./saved-build-table";
import {advanceRoadmapPhase, getPhaseVersions} from "@/lib/api";
import {phaseAdvanceVersions} from "./roadmap-versions";
import {ChatComposer} from "@/features/chat/chat-composer";

export function PhaseEditor({selection, options, ready, months, onSelect, onDirty, onManageBuilds}: {
  selection: RoadmapIdentity; options: RoadmapCatalog; ready: boolean; months: RoadmapMonth[];
  onSelect: (patch: Partial<RoadmapIdentity>) => void;
  onDirty: (dirty: boolean) => void;
  onManageBuilds: () => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const chatTitle = useRef<HTMLHeadingElement>(null);
  const contextReady = ready && !!(selection.product && selection.phase && selection.version);
  const showChat = chatOpen && contextReady;
  useEffect(() => {if (showChat) chatTitle.current?.focus();}, [showChat]);
  const toggleChat = () => {
    if (showChat) {setChatOpen(false); chatToggle.current?.focus();}
    else {setChatMounted(true); setChatOpen(true);}
  };
  const [drafts, setDrafts] = useState<Record<string, BuildDraft>>({});
  const dirty = Object.values(drafts).some(draft => draft.dirty);
  useEffect(() => {onDirty(dirty);}, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const report = useCallback((build: string, draft: BuildDraft | null) => setDrafts(current => {
    if (!draft && !(build in current)) return current;
    const next = {...current}; if (draft) next[build] = draft; else delete next[build]; return next;
  }), []);
  const laterPhases = options.phase.slice(options.phase.indexOf(selection.phase) + 1);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [targetPhase, setTargetPhase] = useState("");
  const [targetVersion, setTargetVersion] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canAdvance = ready && !!selection.version && options.build.length > 0 && options.build.every(build => drafts[build] && !drafts[build].blocked);
  useEffect(() => {if (open) dialog.current?.showModal(); else dialog.current?.close();}, [open]);
  useEffect(() => {
    if (!open || !targetPhase) return;
    let active = true;
    setLoading(true); setChoices([]); setTargetVersion(""); setError("");
    getPhaseVersions(targetPhase).then(versions => {
      if (!active) return;
      const available = phaseAdvanceVersions(versions);
      setChoices(available); setTargetVersion(available[0] ?? "");
    }).catch((reason: Error) => {if (active) setError(reason.message);})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [open, targetPhase, selection.version]);
  return <>
    <div className="roadmap-heading phase-editor-heading"><div className="phase-heading-actions"><h2>{selection.product || "제품 없음"}</h2>
      <button id="edit-build-manager" type="button" className="secondary-button" disabled={!ready || !selection.product} onClick={onManageBuilds}>Build 관리</button></div>
      <div className="phase-heading-actions"><span>{selection.phase || "Phase 없음"} · Version {selection.version}</span>
        <button ref={chatToggle} type="button" className="secondary-button" disabled={!contextReady}
          aria-expanded={showChat} aria-controls="roadmap-edit-chat" onClick={toggleChat}>채팅으로 편집</button>
        <button type="button" disabled={!canAdvance || !laterPhases.length} title={!laterPhases.length ? "다음 Phase가 없습니다." : "현재 제품의 모든 Build를 다음 Phase에 복사합니다."}
          onClick={() => {setTargetPhase(laterPhases[0]); setError(""); setOpen(true);}}>다음 Phase로 등록</button></div>
    </div>
    <div className={`phase-edit-layout${showChat ? " phase-edit-with-chat" : ""}`}>
      <div className="phase-edit-roadmaps">
        {!ready ? <p role="status">저장소 연결을 확인하고 있습니다.</p> : !selection.product || !selection.phase || !selection.version ? <p role="status">제품·Phase·Version을 선택해 주세요.</p> : !months.length ? <p role="status">조회 기간을 준비하고 있습니다.</p> : !options.build.length ? <p role="status">Build를 추가해 주세요.</p> :
      <div className="build-tables">{options.build.map(build => <SavedBuildTable key={build} identity={{...selection, build}} months={months} selected={false} mode="edit" onDraft={report} />)}</div>}
      </div>
      <aside id="roadmap-edit-chat" className="roadmap-edit-chat" aria-labelledby="roadmap-edit-chat-title" hidden={!showChat}>
        <div className="roadmap-edit-chat-header">
          <h3 id="roadmap-edit-chat-title" ref={chatTitle} tabIndex={-1}>채팅으로 편집</h3>
          <button type="button" className="secondary-button" aria-label="채팅으로 편집 닫기" onClick={toggleChat}>닫기</button>
        </div>
        <p className="roadmap-edit-chat-context" aria-label="현재 로드맵">{selection.product} · {selection.phase} · Version {selection.version}</p>
        <p className="roadmap-edit-chat-note">이 대화는 현재 화면에만 표시됩니다.</p>
        {chatMounted && <ChatComposer />}
      </aside>
    </div>
    <dialog ref={dialog} className="option-dialog" aria-labelledby="phase-advance-title" onCancel={event => {event.preventDefault(); if (!busy) setOpen(false);}}>
      <div className="option-dialog-header"><h2 id="phase-advance-title">다음 Phase로 등록</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>닫기</button></div>
      <p>{selection.product} · {selection.phase}_{selection.version} · {options.build.length}개 Build</p>
      <p>현재 편집 내용을 포함해 복사합니다. 기존 Phase의 저장된 내용은 유지됩니다.</p>
      <form className="version-create-panel" onSubmit={async event => {
        event.preventDefault(); if (!canAdvance || loading || busy || !targetVersion) return;
        setBusy(true); setError("");
        try {
          await advanceRoadmapPhase({product: selection.product, phase: selection.phase, version: selection.version, target_phase: targetPhase, target_version: targetVersion,
            builds: options.build.map(build => ({build, revision: drafts[build].revision, data: drafts[build].data}))});
          onDirty(false); setOpen(false); onSelect({phase: targetPhase, version: targetVersion});
        } catch (reason) {setError(reason instanceof Error ? reason.message : "Phase 저장에 실패했습니다.");}
        finally {setBusy(false);}
      }}>
        <label>대상 Phase<select required disabled={busy} value={targetPhase} onChange={event => setTargetPhase(event.target.value)}>{laterPhases.map(phase => <option key={phase}>{phase}</option>)}</select></label>
        <label>신규 Version<select required disabled={busy || loading} value={targetVersion} onChange={event => setTargetVersion(event.target.value)}>
          {!choices.length && <option value="">{loading ? "불러오는 중…" : "선택 가능한 버전 없음"}</option>}{choices.map(version => <option key={version} value={version}>{targetPhase}_{version}</option>)}
        </select></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || loading || !canAdvance || !targetVersion}>{busy ? "저장 중…" : "복사하여 저장"}</button>
      </form>
    </dialog>
  </>;
}
