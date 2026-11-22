"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { getRoadmapMonths, shiftMonth, type RoadmapMonth } from "./roadmap-months";
import { monthRange, itemPosition, sortRoadmapItems, roadmapSortOptions, type RoadmapSort, type RoadmapItem } from "./roadmap-items";
import { RoadmapItemBar } from "./roadmap-item-bar";
import { RoadmapTimeline } from "./roadmap-timeline";
import { formatVersionUpdatedAt } from "./roadmap-versions";

export type RoadmapTableData = { months: RoadmapMonth[]; items: RoadmapItem[]; sort?: RoadmapSort };

export function BuildTable({product, build, months: defaults, selected, data, updatedAt, onChange: onSave, onCancel, onDraft}: {
  product: string; build: string; months: RoadmapMonth[]; selected: boolean;
  data?: RoadmapTableData; onChange: (data: RoadmapTableData) => Promise<void>;
  onCancel?: () => void;
  updatedAt?: string | null;
  onDraft?: (data: RoadmapTableData, blocked: boolean, dirty: boolean) => void;
}) {
  const [editSession, setEditSession] = useState<{original: RoadmapTableData; draft: RoadmapTableData} | null>(() => {
    const original = structuredClone({months: data?.months ?? defaults, items: data?.items ?? [], sort: data?.sort ?? "Start Date (Ascending)"});
    return {original, draft: structuredClone(original)};
  });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rowsId = useId();
  const [saveError, setSaveError] = useState("");
  const [editOrder, setEditOrder] = useState<string[]>(() => sortRoadmapItems(data?.items ?? [], data?.sort ?? "Start Date (Ascending)").map(item => item.id));
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const editMode = editSession !== null;
  const months = editSession?.draft.months ?? data?.months ?? defaults;
  const items = editSession?.draft.items ?? data?.items ?? [];
  const movingItems = items.filter(item => selectedItems.includes(item.id) && itemPosition(item, months));
  const savedSort = data?.sort ?? "Start Date (Ascending)";
  const sort = editSession?.draft.sort ?? savedSort;
  const displayedItems = editMode
    ? [...items].sort((a, b) => (editOrder.indexOf(a.id) < 0 ? Infinity : editOrder.indexOf(a.id)) - (editOrder.indexOf(b.id) < 0 ? Infinity : editOrder.indexOf(b.id)))
    : sortRoadmapItems(items, sort);
  const hasChanges = editSession !== null && JSON.stringify(editSession.original) !== JSON.stringify(editSession.draft);
  function onChange(updated: RoadmapTableData) {
    if (saving) return;
    setEditSession(current => current ? {...current, draft: {...current.draft, ...updated}} : null);
  }
  const [menu, setMenu] = useState<{x: number; y: number; itemId?: string} | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [targetMonth, setTargetMonth] = useState("");
  const [adding, setAdding] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | null>(null);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(defaults[0]);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previous = shiftMonth(referenceMonth, -1);
  const next = shiftMonth(referenceMonth, 1);

  useEffect(() => {
    if (editSession) onDraft?.(editSession.draft, saving || editingItem !== null || adding, hasChanges || editingItem !== null || adding);
  }, [editSession, saving, editingItem, adding, hasChanges, onDraft]);

  useEffect(() => {
    if (!menu) return;
    // Focusing a menu below a populated table must not scroll the page and
    // immediately trigger the scroll listener that dismisses that same menu.
    menuRef.current?.focus({preventScroll: true});
    const dismiss = (event: PointerEvent) => {if (!menuRef.current?.contains(event.target as Node)) setMenu(null);};
    const close = () => setMenu(null);
    const onScroll = (event: Event) => {
      // Scrolling within the menu (including its month select) keeps it open.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {document.removeEventListener("pointerdown", dismiss); window.removeEventListener("resize", close); window.removeEventListener("scroll", onScroll, true);};
  }, [menu]);
  useEffect(() => {
    if (adding) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [adding]);

  function openMenu(event: MouseEvent<HTMLElement>) {
    if (!editMode || saving) return;
    if ((event.target as HTMLElement).closest("button, input, select, dialog")) return;
    event.preventDefault();
    const cellMonth = (event.target as HTMLElement).closest<HTMLElement>("[data-month]")?.dataset.month;
    // Spanning rows (product name, quarters, item lanes) have no month of
    // their own. Use the rendered column bounds, also after horizontal scroll.
    const column = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(".month-row [data-month]"))
      .find(header => {
        const bounds = header.getBoundingClientRect();
        return event.clientX >= bounds.left && event.clientX < bounds.right;
      });
    const plot = (event.target as Element).closest(".timeline-plot");
    const bounds = plot?.getBoundingClientRect();
    const inset = bounds ? Math.min(42, bounds.width / 4) : 0;
    const index = bounds ? Math.max(0, Math.min(months.length - 1, Math.floor((event.clientX - bounds.left - inset) / Math.max(1, bounds.width - inset * 2) * months.length))) : -1;
    const month = cellMonth ?? column?.dataset.month ?? months[index]?.key;
    setTargetMonth(month ?? months.at(-1)?.key ?? "");
    setReferenceMonth(getRoadmapMonths(new Date())[0]);
    setMenu({x: Math.max(8, Math.min(event.clientX, window.innerWidth - 256)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 350))});
  }
  function insert(month: RoadmapMonth) {
    if (months.some(current => current.key === month.key)) return;
    onChange({months: [...months, month].sort((a, b) => a.key.localeCompare(b.key)), items});
    setNotice(`${month.key} 열을 삽입했습니다.`); setMenu(null);
  }
  function openItemMenu(event: MouseEvent<HTMLElement>, itemId: string) {
    if (!editMode || saving) return;
    event.preventDefault(); event.stopPropagation();
    setMenu({itemId, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 256)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 120))});
  }
  const quarters: {label: string; count: number}[] = [];
  for (const month of months) {
    const label = `'${String(month.year).slice(-2)} Q${month.quarter}`;
    if (quarters.at(-1)?.label === label) quarters[quarters.length - 1].count++;
    else quarters.push({label, count: 1});
  }
  return <section className={`build-table-card${selected ? " selected-build" : ""}`} aria-label={`${product} ${build} 로드맵`} onContextMenu={openMenu}>
    <div className="build-title"><h3>{build}</h3>{selected && <span>선택된 Build</span>}
      <div className="build-edit-actions">
        <button type="button" className="secondary-button" aria-expanded={expanded} aria-controls={rowsId}
          disabled={saving || editingItem !== null} onClick={() => {setExpanded(current => !current); setMenu(null);}}>{expanded ? "Collapse" : "Expand"}</button>
        {editMode && <label className="roadmap-sort">Sort by<select aria-label={`${build} Sort by`} value={sort} disabled={saving || editingItem !== null} onChange={event => {
          const nextSort = event.target.value as RoadmapSort;
          onChange({months, items, sort: nextSort});
          setEditOrder(sortRoadmapItems(items, nextSort).map(item => item.id));
        }}>
          {roadmapSortOptions.map(option => <option key={option}>{option}</option>)}
        </select></label>}
        {editMode ? <>
          <div className="build-save-control">
          <span className="build-save-status" role="status" aria-live="polite">{updatedAt && !hasChanges && !saving && !saveError && editingItem === null && !adding ? `Saved (${formatVersionUpdatedAt(updatedAt)})` : ""}</span>
          <button type="button" disabled={saving || !hasChanges || editingItem !== null} onClick={async () => {
            if (!editSession || !hasChanges) return;
            setSaving(true); setSaveError(""); setMenu(null);
            try {
              await onSave(editSession.draft);
              const original = structuredClone(editSession.draft);
              setEditSession({original, draft: structuredClone(original)});
              setEditOrder(sortRoadmapItems(original.items, original.sort ?? "Start Date (Ascending)").map(item => item.id));
              setAdding(false); setEditingItem(null);
              setNotice("변경사항을 DuckDB에 저장했습니다.");
            } catch (error) { setSaveError(error instanceof Error ? error.message : "저장에 실패했습니다."); }
            finally {setSaving(false);}
          }}>{saving ? "저장 중…" : "Save Changes"}</button>
          </div>
          <button type="button" disabled={saving} className="secondary-button" onPointerDown={event => event.preventDefault()} onClick={() => {
            setEditSession(current => current ? {...current, draft: structuredClone(current.original)} : null); setMenu(null); setAdding(false); setEditingItem(null); setNotice("변경사항을 취소했습니다.");
            setSaveError(""); setSelectedItems([]);
            onCancel?.();
          }}>Cancel</button>
        </> : <button type="button" onClick={() => {
          const original = structuredClone({months, items, sort: savedSort});
          setEditOrder(displayedItems.map(item => item.id));
          setSelectedItems([]);
          setEditSession({original, draft: {...structuredClone(original), sort}}); setNotice(""); setSaveError("");
        }}>Edit</button>}
      </div>
    </div>
    <div id={rowsId} hidden={!expanded}>
    {expanded && <div className="roadmap-scroll" tabIndex={0} role="region" aria-label={`${build} 월별 표`}>
      {months.length ? <table className="roadmap-table">
        <caption>{product} · {build} · Month{editMode && " · Shift+클릭: 다중 선택 · 선택한 박스 드래그: 함께 이동"}</caption>
        <thead><tr className="quarter-row">{quarters.map(q => <th key={q.label} colSpan={q.count} scope="colgroup">{q.label}</th>)}</tr>
          <tr className="month-row">{months.map(month => <th key={month.key} data-month={month.key} scope="col" aria-label={month.key}>{month.label}</th>)}</tr></thead>
        <tbody><tr className="product-row"><th colSpan={months.length} scope="rowgroup">{product}</th></tr>
          {displayedItems.filter(item => itemPosition(item, months)).map(item => <tr key={item.id} className="roadmap-item-row"><td colSpan={months.length}>
            <RoadmapItemBar item={item} months={months} editable={editMode && !saving} selected={selectedItems.includes(item.id)}
              onSelect={toggle => setSelectedItems(current => toggle ? current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id] : [item.id])}
              movingItems={movingItems} onMoveChange={updated => {
                const replacements = new Map(updated.map(value => [value.id, value]));
                onChange({months, items: items.map(current => replacements.get(current.id) ?? current)});
              }} editing={editingItem === item.id} onEditEnd={() => setEditingItem(null)}
              onEditName={() => {setMenu(null); setSelectedItems([item.id]); setEditingItem(item.id);}}
              onChange={updated => onChange({months, items: items.map(current => current.id === updated.id ? updated : current)})} onMenu={openItemMenu} />
          </td></tr>)}
          <tr className="roadmap-empty-row">{months.map(month => <td key={month.key} data-month={month.key} className={month.key === defaults[0].key ? "current-month" : undefined} aria-label={`${month.key} 빈 영역`} />)}</tr></tbody>
      </table> : <p className="roadmap-empty-message">표시할 월이 없습니다. 우클릭 메뉴에서 월을 삽입하세요.</p>}
    </div>}
    </div>
    <RoadmapTimeline months={months} items={items} build={build} compact={!expanded} showBuildLabel={false} />
    {!months.length && !expanded && <p className="roadmap-empty-message">표시할 월이 없습니다. 우클릭 메뉴에서 월을 삽입하세요.</p>}
    {expanded && !items.length && <p className="roadmap-empty-message">등록된 로드맵 일정이 없습니다.</p>}
    <p className="roadmap-action-status" role="status">{notice}</p>
    {saveError && <p className="error" role="alert">{saveError} 편집 내용은 유지됩니다.</p>}
    {editMode && !saving && menu && <div ref={menuRef} className="roadmap-context-menu" role="dialog" aria-label={`${build} 표 편집`} tabIndex={-1}
      style={{left: menu.x, top: menu.y}} onContextMenu={event => {event.preventDefault(); event.stopPropagation();}} onKeyDown={event => {if (event.key === "Escape") {event.stopPropagation(); setMenu(null);}}}>
      {menu.itemId ? <>
        <button type="button" onClick={() => {
          const item = items.find(current => current.id === menu.itemId);
          if (!item) return;
          setDialogItemId(item.id); setAddingMilestone(item.kind === "milestone");
          setName(item.name); setContent(item.content ?? ""); setStartDate(item.startDate); setEndDate(item.endDate);
          setEditingItem(null); setMenu(null); setAdding(true);
        }}>항목 편집</button>
        <button type="button" onClick={() => {
          onChange({months, items: items.filter(item => item.id !== menu.itemId)}); setEditingItem(null); setMenu(null); setNotice("항목을 삭제했습니다.");
        }}>항목 삭제</button>
      </> : <><label>대상 월<select value={targetMonth} onChange={event => setTargetMonth(event.target.value)} disabled={!months.length}>
        {!months.length && <option value="">월 없음</option>}{months.map(month => <option key={month.key} value={month.key}>{month.key}</option>)}
      </select></label>
      <button type="button" disabled={!months.length} onClick={() => {
        const range = monthRange(targetMonth);
        setStartDate(range.startDate); setEndDate(range.endDate);
        setMenu(null); setName(""); setDialogItemId(null); setAddingMilestone(false); setAdding(true);
      }}>항목 추가</button>
      <button type="button" disabled={!months.length} onClick={() => {
        const date = monthRange(targetMonth).startDate;
        setStartDate(date); setEndDate(date); setContent("");
        setMenu(null); setName(""); setDialogItemId(null); setAddingMilestone(true); setAdding(true);
      }}>마일스톤 추가</button>
      <button type="button" disabled={!months.some(month => month.key === targetMonth)} onClick={() => {
        onChange({months: months.filter(month => month.key !== targetMonth), items});
        setNotice(`${targetMonth} 열을 삭제했습니다.`); setMenu(null);
      }}>열 삭제</button>
      <button type="button" disabled={months.some(month => month.key === previous.key)} onClick={() => insert(previous)}>지난 달 삽입</button>
      <button type="button" disabled={months.some(month => month.key === next.key)} onClick={() => insert(next)}>다음 달 삽입</button></>}
    </div>}
    <dialog ref={dialogRef} className="option-dialog" aria-labelledby={`item-title-${build}`} onCancel={() => setAdding(false)}>
      <div className="option-dialog-header"><h2 id={`item-title-${build}`}>{addingMilestone ? "마일스톤" : "항목"} {dialogItemId ? "편집" : "추가"} · {build}</h2><button type="button" className="secondary-button" onClick={() => setAdding(false)}>닫기</button></div>
      <form className="roadmap-item-form" onSubmit={event => {
        event.preventDefault(); if (!editMode || saving || !name.trim() || !startDate || !endDate || startDate > endDate) return;
        const existing = dialogItemId ? items.find(item => item.id === dialogItemId) : undefined;
        if (dialogItemId && !existing) return;
        const visibleMonths = new Map(months.map(month => [month.key, month]));
        let cursor = getRoadmapMonths(new Date(`${startDate}T00:00:00Z`))[0];
        while (cursor.key <= endDate.slice(0, 7)) {
          visibleMonths.set(cursor.key, cursor);
          if (cursor.key === endDate.slice(0, 7)) break;
          cursor = shiftMonth(cursor, 1);
        }
        const updated: RoadmapItem = {...existing, id: existing?.id ?? crypto.randomUUID(), name: name.trim(), startDate, endDate,
          ...(addingMilestone ? {kind: "milestone" as const, content: content.trim()} : {})};
        onChange({months: [...visibleMonths.values()].sort((a, b) => a.key.localeCompare(b.key)),
          items: existing ? items.map(item => item.id === existing.id ? updated : item) : [...items, updated]});
        setAdding(false); setNotice(`${addingMilestone ? "마일스톤을" : "항목을"} ${dialogItemId ? "수정" : "추가"}했습니다.`);
      }}>
        <label>{addingMilestone ? "마일스톤 명" : "항목명"}<input autoFocus required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
        {addingMilestone ? <>
          <label>마일스톤 내용<textarea rows={4} maxLength={20000} value={content} onChange={event => setContent(event.target.value)} /></label>
          <label>Target Date<input type="date" required min="0001-01-01" max="9999-12-31" value={startDate}
            onClick={event => {try {event.currentTarget.showPicker?.();} catch { /* Native date input remains available. */ }}}
            onChange={event => {setStartDate(event.target.value); setEndDate(event.target.value);}} /></label>
        </> : <div className="roadmap-date-fields">
          <label>Start Date<input type="date" required min="0001-01-01" max={endDate || "9999-12-31"} value={startDate}
            onClick={event => {try {event.currentTarget.showPicker?.();} catch { /* Native date input remains available. */ }}}
            onChange={event => setStartDate(event.target.value)} /></label>
          <label>End Date<input type="date" required min={startDate || "0001-01-01"} max="9999-12-31" value={endDate}
            onClick={event => {try {event.currentTarget.showPicker?.();} catch { /* Native date input remains available. */ }}}
            onChange={event => setEndDate(event.target.value)} /></label>
        </div>}
        {startDate && endDate && startDate > endDate && <p className="selection-error" role="alert">End Date는 Start Date보다 빠를 수 없습니다.</p>}
        <button disabled={saving || !name.trim() || !startDate || !endDate || startDate > endDate}>{dialogItemId ? "적용" : "추가"}</button>
      </form>
    </dialog>
  </section>;
}
