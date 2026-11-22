"use client";
import {useEffect, useRef, useState} from "react";
import {saveProductBuilds} from "@/lib/api";

export function BuildManager({product, items, onChange, onClose, confirmLeave}: {
  product: string; items: string[]; onChange: (items: string[], renamed?: {old: string; name: string}, added?: string) => void;
  onClose: () => void; confirmLeave?: () => boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(items), [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dirty = !!name || (editing !== null && editing !== editName);
  useEffect(() => {dialog.current?.showModal(); return () => dialog.current?.close();}, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {if (dirty) {event.preventDefault(); event.returnValue = "";}};
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() {if (!busy && (!dirty || window.confirm("저장하지 않은 Build 입력을 버리고 닫으시겠습니까?"))) onClose();}
  async function commit(next: string[], renamed?: {old: string; name: string}, added?: string) {
    if (busy || (confirmLeave && !confirmLeave())) return;
    if (next.some(value => !value || value.length > 120 || ["(추가)", "(제품추가)"].includes(value)) || new Set(next).size !== next.length) {setError("중복되지 않는 Build 이름을 120자 이내로 입력해 주세요."); return;}
    setBusy(true); setError("");
    try {await saveProductBuilds(product, next, rows); setRows(next); setEditing(null); setName(""); onChange(next, renamed, added);}
    catch (reason) {setError(reason instanceof Error ? reason.message : "Build 저장에 실패했습니다.");}
    finally {setBusy(false);}
  }
  return <dialog ref={dialog} className="option-dialog" aria-labelledby="build-manager-title" onCancel={event => {event.preventDefault(); close();}}>
    <div className="option-dialog-header"><h2 id="build-manager-title">{product} · Build 목록 관리</h2><button type="button" disabled={busy} onClick={close}>닫기</button></div>
    <p>이 제품의 Build만 관리합니다. 삭제해도 과거 저장된 로드맵은 유지됩니다.</p>
    <div className="option-table-scroll"><table className="option-table"><thead><tr><th>Build</th><th>이동</th><th>편집</th></tr></thead><tbody>
      {rows.map((row, index) => <tr key={row}><td>{editing === row ? <input aria-label={`${row} 이름 수정`} value={editName} maxLength={120} onChange={event => setEditName(event.target.value)} /> : row}</td>
        <td><div className="row-actions">{([-1, 1] as const).map(direction => <button key={direction} type="button" disabled={busy || editing !== null || index + direction < 0 || index + direction >= rows.length} aria-label={`${row} ${direction < 0 ? "위로" : "아래로"} 이동`} onClick={() => {const next = [...rows]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; void commit(next);}}>{direction < 0 ? "↑" : "↓"}</button>)}</div></td>
        <td><div className="row-actions">{editing === row ? <><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button type="button" disabled={busy} onClick={() => commit(rows.map(value => value === row ? editName.trim() : value), {old: row, name: editName.trim()})}>Save as</button></> : <>
          <button type="button" disabled={busy || editing !== null} onClick={() => {setEditing(row); setEditName(row);}}>Edit</button>
          <button type="button" className="delete-button" disabled={busy || editing !== null} onClick={() => commit(rows.filter(value => value !== row))}>Del</button></>}</div></td></tr>)}
      {!rows.length && <tr><td colSpan={3}>Build를 추가해 주세요.</td></tr>}
    </tbody></table></div>
    <form className="option-new" onSubmit={event => {event.preventDefault(); void commit([...rows, name.trim()], undefined, name.trim());}}>
      <label>새 Build명<input required maxLength={120} disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label><button disabled={busy || editing !== null}>추가</button>
    </form>{error && <p role="alert" className="error">{error}</p>}
  </dialog>;
}
