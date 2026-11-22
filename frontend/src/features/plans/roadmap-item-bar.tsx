"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { RoadmapMonth } from "./roadmap-months";
import { dateAtPosition, itemPosition, resizeItem, moveItemsTogether, type RoadmapItem } from "./roadmap-items";

export function RoadmapItemBar({item, months, editable, selected, onSelect, movingItems, onMoveChange, editing, onEditName, onEditEnd, onChange, onMenu}: {
  item: RoadmapItem; months: RoadmapMonth[]; editable: boolean; editing: boolean; onEditEnd: () => void;
  selected: boolean; onSelect: (toggle: boolean) => void;
  movingItems: RoadmapItem[]; onMoveChange: (items: RoadmapItem[]) => void;
  onEditName: () => void;
  onChange: (item: RoadmapItem) => void; onMenu: (event: MouseEvent<HTMLElement>, id: string) => void;
}) {
  const lane = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{edge: "start" | "end"; original: RoadmapItem} | null>(null);
  const move = useRef<{original: RoadmapItem[]; anchor: string; x: number; moved: boolean} | null>(null);
  const [moving, setMoving] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [error, setError] = useState("");
  const finished = useRef(false);
  const position = itemPosition(item, months);
  useEffect(() => {
    if (editing) {finished.current = false; setDraft(item.name); setError(""); input.current?.focus(); input.current?.select();}
  }, [editing, item.name]);
  if (!position) return null;
  const milestone = item.kind === "milestone";

  function save() {
    if (finished.current) return true;
    if (!draft.trim()) {setError("항목명을 입력해 주세요."); input.current?.focus(); return false;}
    finished.current = true; onChange({...item, name: draft.trim()}); onEditEnd(); return true;
  }
  function update(event: PointerEvent<HTMLButtonElement>) {
    if (!editable || !drag.current || !lane.current) return;
    const rect = lane.current.getBoundingClientRect();
    const date = dateAtPosition(months, (event.clientX - rect.left) / rect.width * months.length, drag.current.edge);
    onChange(resizeItem(drag.current.original, drag.current.edge, date));
  }
  function pointerDate(clientX: number) {
    const rect = lane.current!.getBoundingClientRect();
    return dateAtPosition(months, (clientX - rect.left) / rect.width * months.length, "start");
  }
  function updateMove(event: PointerEvent<HTMLDivElement>) {
    if (!editable || !move.current || !lane.current) return;
    if (!move.current.moved && Math.abs(event.clientX - move.current.x) < 4) return;
    move.current.moved = true;
    setMoving(true);
    const days = (Date.parse(`${pointerDate(event.clientX)}T00:00:00Z`) - Date.parse(`${move.current.anchor}T00:00:00Z`)) / 86400000;
    onMoveChange(moveItemsTogether(move.current.original, days, `${months[0].key}-01`, dateAtPosition(months, months.length, "end")));
  }
  function cancelMove() {
    if (move.current?.moved) onMoveChange(move.current.original);
    move.current = null; setMoving(false);
  }
  return <div className="roadmap-item-lane" ref={lane} style={{backgroundSize: `${100 / months.length}% 100%`}}>
    <div className={`roadmap-duration${milestone ? " roadmap-milestone" : ""}${editing ? " editing" : ""}${editable ? " movable" : ""}${editable && selected ? " selected-item" : ""}${moving ? " moving-item" : ""}`} style={{left: `${position.left}%`, width: milestone ? undefined : `${position.width}%`}}
      tabIndex={editable ? 0 : undefined} role={editable ? "button" : undefined} aria-pressed={editable ? selected : undefined}
      aria-label={`${item.name}: ${item.startDate} ~ ${item.endDate}`}
      onDoubleClick={event => {
        if (!editable || editing || (event.target as HTMLElement).closest("button, input")) return;
        event.preventDefault(); event.stopPropagation(); cancelMove(); onEditName();
      }}
      onPointerDown={event => {
        if (!editable || editing || event.button !== 0 || (event.target as HTMLElement).closest("button, input")) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({preventScroll: true});
        if (event.shiftKey) {onSelect(true); return;}
        if (!selected) onSelect(false);
        if (!selected || !lane.current) return;
        move.current = {original: movingItems, anchor: pointerDate(event.clientX), x: event.clientX, moved: false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={updateMove} onPointerUp={event => {
        if (!move.current) return;
        updateMove(event); move.current = null; setMoving(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={cancelMove} onLostPointerCapture={cancelMove}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !editable || editing) return;
        if (event.key === "Escape") {event.preventDefault(); cancelMove();}
        if (event.key === "F2") {event.preventDefault(); cancelMove(); onEditName();}
        if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onSelect(event.shiftKey);}
        if (selected && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault(); onMoveChange(moveItemsTogether(movingItems, event.key === "ArrowLeft" ? -1 : 1, `${months[0].key}-01`, dateAtPosition(months, months.length, "end")));
        }
      }}
      title={milestone ? `${item.name}: ${item.startDate}\n${item.content ?? ""}` : `${item.name}: ${item.startDate} ~ ${item.endDate}`} onContextMenu={event => onMenu(event, item.id)}>
      {editable && !milestone && (["start", "end"] as const).map(edge => <button key={edge} type="button" className={`resize-handle ${edge}`}
        aria-label={`${item.name} ${edge === "start" ? "시작일" : "종료일"} 조정`} title={edge === "start" ? item.startDate : item.endDate} disabled={editing}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); drag.current = {edge, original: item}; event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={update} onPointerUp={event => {if (drag.current) {update(event); drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId);}}}
        onPointerCancel={() => {if (drag.current) onChange(drag.current.original); drag.current = null;}}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault(); const date = new Date(`${edge === "start" ? item.startDate : item.endDate}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + (event.key === "ArrowLeft" ? -1 : 1));
          const next = date.toISOString().slice(0, 10);
          const min = `${months[0].key}-01`, max = dateAtPosition(months, months.length, "end");
          onChange(resizeItem(item, edge, next < min ? min : next > max ? max : next));
        }} />)}
      {!editing && <span className="duration-name">{milestone && <span className="milestone-marker" aria-label="마일스톤">◆ </span>}{item.name}</span>}
    </div>
    {editable && editing && <div className="roadmap-inline-editor" style={{left: `${Math.min(position.left, 60)}%`, width: `${Math.max(40, Math.min(position.width, 100 - position.left))}%`}}>
      <input ref={input} aria-label={milestone ? "마일스톤 명 편집" : "항목명 편집"} maxLength={120} value={draft} aria-invalid={Boolean(error)}
        onChange={event => {setDraft(event.target.value); setError("");}} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {event.preventDefault(); save();}
          if (event.key === "Tab" && !save()) event.preventDefault();
          if (event.key === "Escape") {event.preventDefault(); finished.current = true; onEditEnd();}
        }} onBlur={() => {if (draft.trim()) save();}} />
      {error && <span role="alert" className="selection-error">{error}</span>}
    </div>}
    <span className="duration-dates" style={{left: `min(${position.left}%, calc(100% - ${milestone ? 10 : 23}ch))`}}>{item.startDate}{!milestone && ` – ${item.endDate}`}</span>
  </div>;
}
