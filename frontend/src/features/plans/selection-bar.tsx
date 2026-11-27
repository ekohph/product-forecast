"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getRoadmapCatalog, getPhaseVersions, addPhaseVersion, previewVersionDeletion, deletePhaseVersion, saveVersionContent, registerRoadmapProduct } from "@/lib/api";
import { BuildManager } from "./build-manager";
import { readRoadmapLink } from "./roadmap-link";
import type { RoadmapVersionInfo } from "@/types/roadmaps";
import { nextRoadmapVersions, formatVersionUpdatedAt, sortVersionsDescending } from "./roadmap-versions";

type Category = "product" | "build" | "phase" | "version";
const categories: { key: Category; title: string; addLabel: string }[] = [
  { key: "product", title: "제품", addLabel: "(제품추가)" },
  { key: "build", title: "Build", addLabel: "(추가)" },
  { key: "phase", title: "Phase", addLabel: "(Phase 편집)" },
  { key: "version", title: "Version", addLabel: "(Version 편집)" },
];

export function SelectionBar({children, initialSelection, availableOptions, idPrefix = "select", confirmLeave, sharedLink = false, omitProduct = false}: {
  children?: (selection: Record<Category, string>, options: Record<Category, string[]>, ready: boolean, select: (patch: Partial<Record<Category, string>>) => void, manageBuilds: () => void) => ReactNode;
  initialSelection?: Record<Category, string>; availableOptions?: Record<Category, string[]>; idPrefix?: string;
  confirmLeave?: () => boolean;
  sharedLink?: boolean; omitProduct?: boolean;
}) {
  const [options, setOptions] = useState<Record<Category, string[]>>({
    product: ["4175"], build: ["P1", "EVT", "DVT"], phase: ["Plan", "내부 협의 완료", "고객 협의 완료"],
    version: ["0.0"],
  });
  const [selection, setSelection] = useState<Record<Category, string>>(initialSelection ?? {product: "4175", build: "P1", phase: "Plan", version: "0.0"});
  const [managing, setManaging] = useState<Category | null>(null);
  const category = categories.find(item => item.key === managing);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [versionPhase, setVersionPhase] = useState<string | null>(null);
  const [versionError, setVersionError] = useState("");
  const [buildProduct, setBuildProduct] = useState<string | null>(null);
  const [buildError, setBuildError] = useState("");
  const sharedVersion = useRef<{phase: string; version: string} | null>(null);
  const linkApplied = useRef(false);
  useEffect(() => {
    if (availableOptions) {
      setOptions(current => ({...availableOptions, version: current.version, build: current.build}));
      setSelection(current => Object.fromEntries(categories.map(({key}) => [key, key === "version" || key === "build" || availableOptions[key].includes(current[key]) ? current[key] : availableOptions[key][0] ?? ""])) as Record<Category, string>);
      setReady(true); setLoadError("");
      return;
    }
    let active = true;
    setReady(false); setLoadError("");
    getRoadmapCatalog().then(saved => {
      if (!active) return;
      const linked = sharedLink && !linkApplied.current ? readRoadmapLink(window.location.search) : null;
      if (linked && (!saved.product.includes(linked.product) || !saved.phase.includes(linked.phase))) {
        throw new Error("공유 링크의 제품 또는 Phase를 찾을 수 없습니다. 삭제되었거나 이름이 변경되었는지 확인하세요.");
      }
      setOptions(saved);
      if (linked) {setSelection(current => ({...current, ...linked})); sharedVersion.current = linked;}
      else setSelection(current => Object.fromEntries(categories.map(({key}) => [key, key === "version" || saved[key].includes(current[key]) ? current[key] : saved[key][0] ?? ""])) as Record<Category, string>);
      linkApplied.current = true;
      setReady(true);
    }).catch((error: Error) => {if (active) setLoadError(error.message);});
    return () => {active = false;};
  }, [attempt, availableOptions, sharedLink]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setVersionPhase(null); setVersionError("");
    if (!selection.phase) {
      setOptions(current => ({...current, version: []}));
      setSelection(current => ({...current, version: ""})); setVersionPhase("");
      return;
    }
    getRoadmapCatalog(selection.phase).then(catalog => {
      if (!active) return;
      if (sharedVersion.current?.phase === selection.phase && sharedVersion.current.version === selection.version && !catalog.version.includes(selection.version)) {
        setVersionError("공유 링크의 Version을 찾을 수 없습니다. 다른 Phase를 선택하거나 링크를 확인하세요.");
        return;
      }
      sharedVersion.current = null;
      setOptions(current => ({...current, version: catalog.version}));
      setSelection(current => ({...current, version: catalog.version.includes(current.version) ? current.version : catalog.version[0] ?? ""}));
      setVersionPhase(selection.phase);
    }).catch((reason: Error) => {if (active) setVersionError(reason.message);});
    return () => {active = false;};
  }, [ready, selection.phase, attempt]);
  const versionsReady = versionPhase === selection.phase;
  useEffect(() => {
    if (!ready) return;
    let active = true; setBuildProduct(null); setBuildError("");
    if (!selection.product) {setOptions(current => ({...current, build: []})); setBuildProduct(""); return;}
    getRoadmapCatalog(undefined, selection.product).then(catalog => {
      if (!active) return;
      setOptions(current => ({...current, build: catalog.build}));
      setSelection(current => ({...current, build: catalog.build.includes(current.build) ? current.build : catalog.build[0] ?? ""}));
      setBuildProduct(selection.product);
    }).catch((reason: Error) => {if (active) setBuildError(reason.message);});
    return () => {active = false;};
  }, [ready, selection.product, attempt]);
  useEffect(() => {
    const deleted = (event: Event) => {
      const detail = (event as CustomEvent<{phase: string; version: string}>).detail;
      if (detail.phase !== selection.phase) return;
      const remaining = options.version.filter(value => value !== detail.version);
      setOptions(current => ({...current, version: current.version.filter(value => value !== detail.version)}));
      setSelection(current => current.version === detail.version ? {...current, version: remaining[0] ?? ""} : current);
    };
    window.addEventListener("roadmap-version-deleted", deleted);
    return () => window.removeEventListener("roadmap-version-deleted", deleted);
  }, [selection.phase, options.version]);

  return <><section className="selection-panel" aria-label={omitProduct ? "공통 Phase Version 선택" : "제품 Phase Version 선택"}>
    <div className={`selection-bar${omitProduct ? " portfolio-selection" : ""}`}>
      {categories.filter(item => item.key !== "build" && (!omitProduct || item.key !== "product")).map(item => <label key={item.key} htmlFor={`${idPrefix}-${item.key}`}>
        <span>{item.title}</span>
        <select id={`${idPrefix}-${item.key}`} disabled={!ready || (item.key === "build" && (buildProduct !== selection.product || !selection.product)) || (item.key === "version" && (!versionsReady || !selection.phase))} value={selection[item.key]} onChange={event => {
          const value = event.target.value;
          if (value === "(추가)") setManaging(item.key);
          else {
            if (item.key !== "build" && value !== selection[item.key] && confirmLeave && !confirmLeave()) return;
            setSelection(current => ({...current, [item.key]: value}));
          }
        }}>
          {!options[item.key].length && <option value="" disabled>항목 없음</option>}
          {options[item.key].map(value => <option key={value} value={value}>{value}</option>)}
          <option value="(추가)">{item.addLabel}</option>
        </select>
      </label>)}
    </div>
    {!ready && !loadError && <p className="roadmap-action-status" role="status">저장된 제품·버전 목록을 불러오고 있습니다.</p>}
    {loadError && <div className="error" role="alert">{loadError} <button type="button" onClick={() => setAttempt(current => current + 1)}>다시 시도</button></div>}
    {versionError && <div className="error" role="alert">{versionError} <button type="button" onClick={() => setAttempt(current => current + 1)}>다시 시도</button></div>}
    {!omitProduct && buildError && <div className="error" role="alert">{buildError}<button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></div>}
    {managing === "build" && <BuildManager key={selection.product} product={selection.product} items={options.build} confirmLeave={confirmLeave}
      onClose={() => {setManaging(null); document.getElementById("edit-build-manager")?.focus();}}
      onChange={(builds, renamed, added) => {
        setOptions(current => ({...current, build: builds}));
        setSelection(current => ({...current, build: added ?? (renamed && current.build === renamed.old ? renamed.name : builds.includes(current.build) ? current.build : builds[0] ?? "")}));
      }} />}
    {category && category.key !== "build" && <OptionManager key={`${category.key}-${selection.phase}`} title={category.title} items={options[category.key]} phase={selection.phase} selectedVersion={selection.version}
      productMode={category.key === "product"}
      confirmLeave={confirmLeave}
      versionMode={category.key === "version"}
      allowDelete={category.key !== "version"}
      onDelete={name => {
        const remaining = options[category.key].filter(item => item !== name);
        setOptions(current => ({...current, [category.key]: remaining}));
        setSelection(current => ({...current, [category.key]: current[category.key] === name ? remaining[0] ?? "" : current[category.key]}));
      }}
      onClose={() => { setManaging(null); document.getElementById(`${idPrefix}-${category.key}`)?.focus(); }}
      onSave={(items, renamed, added) => {
        setOptions(current => ({...current, [category.key]: items}));
        setSelection(current => ({...current, [category.key]: added ??
          (renamed && current[category.key] === renamed.old ? renamed.name : current[category.key])}));
      }} />}
  </section>{children?.(selection, options, ready && versionsReady && (omitProduct || buildProduct === selection.product), patch => setSelection(current => ({...current, ...patch})), () => setManaging("build"))}</>;
}

function OptionManager({ title, items, onClose, onSave, allowDelete, onDelete, versionMode, phase, selectedVersion, confirmLeave, productMode }: {
  title: string; items: string[]; onClose: () => void;
  allowDelete: boolean; onDelete: (name: string) => void;
  versionMode: boolean;
  productMode: boolean;
  phase: string;
  selectedVersion: string;
  confirmLeave?: () => boolean;
  onSave: (items: string[], renamed?: {old: string; name: string}, added?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(items);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [versionDetails, setVersionDetails] = useState<RoadmapVersionInfo[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(versionMode);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [copyContent, setCopyContent] = useState(false);
  const [copySource, setCopySource] = useState(selectedVersion || items.at(-1) || "");
  const orderChanged = JSON.stringify(rows) !== JSON.stringify(items);
  const notesDirty = rows.some(row => noteDrafts[row] !== undefined && noteDrafts[row] !== (versionDetails.find(info => info.version === row)?.content ?? ""));
  const dirty = versionMode ? pendingVersion !== null || notesDirty : (orderChanged || (editing !== null && editName !== editing) || newName.length > 0);
  const nextVersions = nextRoadmapVersions(rows);
  const copyVersions = sortVersionsDescending(rows);
  useEffect(() => {
    if (!versionMode) return;
    let active = true;
    getPhaseVersions(phase).then(details => {if (active) {setVersionDetails(details); setDetailsLoaded(true);}})
      .catch((reason: Error) => {if (active) setError(reason.message);})
      .finally(() => {if (active) setDetailsLoading(false);});
    return () => {active = false;};
  }, [phase, versionMode]);
  async function saveNote(version: string) {
    if (busy || !detailsLoaded) return;
    const original = versionDetails.find(info => info.version === version);
    const content = noteDrafts[version] ?? original?.content ?? "";
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await saveVersionContent(phase, version, content, original?.content ?? "");
      setVersionDetails(current => [...current.filter(info => info.version !== version), {...original, version, roadmap_count: original?.roadmap_count ?? 0, ...saved}]);
      setNotice(`${phase}_${version} 내용을 저장했습니다.`);
    } catch (reason) {setError(reason instanceof Error ? reason.message : "내용을 저장하지 못했습니다.");}
    finally {setBusy(false);}
  }
  function prepareVersion(value: string) {
    setPendingVersion(value);
    if (pendingVersion === null) {
      setCopyContent(copyVersions.length > 0);
      setCopySource(rows.includes(selectedVersion) ? selectedVersion : copyVersions[0] || "");
    }
    setError(""); setNotice("");
  }
  async function addVersion(value: string) {
    if (busy || !valid(value)) return;
    if (confirmLeave && !confirmLeave()) return;
    setBusy(true); setError("");
    try {
      const result = await addPhaseVersion(phase, value, copyContent ? copySource : undefined);
      const next = [...rows, value];
      onSave(next, undefined, value); setRows(next); setPendingVersion(null);
      setVersionDetails(current => [...current.filter(info => info.version !== value), {version: value, updated_at: result.updated_at, roadmap_count: result.roadmap_count}]);
      setNotice(`${phase}_${value} 버전을 추가했습니다.${copyContent ? ` 저장된 로드맵 ${result.roadmap_count}개를 복사했습니다.` : ""}`);
    } catch (reason) {setError(reason instanceof Error ? reason.message : "버전을 추가하지 못했습니다.");}
    finally {setBusy(false);}
  }
  async function removeVersion(value: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const preview = await previewVersionDeletion(phase, value);
      const confirmed = preview.roadmap_count > 0 || preview.has_note;
      if (confirmed && !window.confirm(`${phase}_${value}에 저장된 로드맵 ${preview.roadmap_count}개${preview.has_note ? " 및 버전 내용 메모" : ""}가 있습니다.\n${phase} Phase의 모든 제품·Build에서 이 버전의 내용이 삭제됩니다. 다른 Phase는 유지됩니다.\n삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
      if (confirmLeave && !confirmLeave()) return;
      await deletePhaseVersion(phase, value, preview.token, confirmed);
      onDelete(value); setRows(current => current.filter(row => row !== value));
      setVersionDetails(current => current.filter(info => info.version !== value));
      setNoteDrafts(current => {const next = {...current}; delete next[value]; return next;});
      window.dispatchEvent(new CustomEvent("roadmap-version-deleted", {detail: {phase, version: value}}));
      setNotice(`${phase}_${value} 버전을 삭제했습니다.`);
    } catch (reason) {setError(reason instanceof Error ? reason.message : "버전을 삭제하지 못했습니다.");}
    finally {setBusy(false);}
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function close() {
    if (busy) return;
    if (dirty && !window.confirm("저장하지 않은 변경 내용이 있습니다. 변경 내용을 버리고 닫으시겠습니까?")) return;
    onClose();
  }
  function valid(value: string, original?: string) {
    if (!value) { setError("이름을 입력해 주세요."); return false; }
    if (value.length > 120 || ["(추가)", "(제품추가)"].includes(value) || rows.some(row => row === value && row !== original)) {
      setError("중복되지 않는 이름을 120자 이내로 입력해 주세요."); return false;
    }
    return true;
  }
  function move(index: number, direction: number) {
    const next = [...rows];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setRows(next); setNotice("");
  }
  function saveName() {
    if (editing === null) return;
    const name = editName.trim();
    if (!valid(name, editing)) return;
    if (confirmLeave && !confirmLeave()) return;
    const next = rows.map(row => row === editing ? name : row);
    onSave(next, {old: editing, name}); setRows(next); setEditing(null); setError(""); setNotice("이름과 순서를 저장했습니다.");
  }

  return <dialog ref={dialog} className="option-dialog" aria-labelledby="option-manager-title"
    onCancel={event => {event.preventDefault(); close();}}>
    <header className="option-dialog-header"><h2 id="option-manager-title">{versionMode ? `${phase} · Version` : title} 목록 관리</h2>
      <button type="button" className="secondary-button" disabled={busy} onClick={close}>닫기</button></header>
    <p>{versionMode ? "가장 큰 숫자 버전을 기준으로 추가합니다. 추가·삭제한 목록은 자동 저장됩니다." : "화살표로 순서를 바꾸고 Edit으로 이름을 수정하세요."}</p>
    <div className="option-table-scroll"><table className="option-table">
      <thead><tr><th scope="col">{title}명</th>{versionMode && <th scope="col">내용</th>}{versionMode ? <th scope="col">마지막 업데이트 시각</th> : <th scope="col">이동</th>}<th scope="col">{versionMode ? "삭제" : "편집"}</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row}>
        <td>{editing === row ? <input autoFocus aria-label={`${row} 이름 수정`} maxLength={120} value={editName}
          onChange={event => {setEditName(event.target.value); setError(""); setNotice("");}}
          onKeyDown={event => {if (event.key === "Enter") {event.preventDefault(); saveName();}}} /> : versionMode ? `${phase}_${row}` : row}</td>
        {!versionMode && <td><div className="row-actions"><button type="button" aria-label={`${row} 위로 이동`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`${row} 아래로 이동`} disabled={busy || index === rows.length - 1} onClick={() => move(index, 1)}>↓</button></div></td>}
        {versionMode && <td className="version-note-cell">
          <textarea rows={2} maxLength={200} aria-label={`${phase}_${row} 내용`} placeholder="최대 200자" disabled={busy || !detailsLoaded}
            value={noteDrafts[row] ?? versionDetails.find(info => info.version === row)?.content ?? ""}
            onChange={event => {setNoteDrafts(current => ({...current, [row]: event.target.value})); setNotice("");}} />
          <div className="version-note-actions"><small>{(noteDrafts[row] ?? versionDetails.find(info => info.version === row)?.content ?? "").length}/200</small>
            <button type="button" disabled={busy || !detailsLoaded || noteDrafts[row] === undefined || noteDrafts[row] === (versionDetails.find(info => info.version === row)?.content ?? "")} onClick={() => saveNote(row)}>저장</button></div>
        </td>}
        {versionMode && <td className="version-updated-at">{detailsLoading ? "불러오는 중…" : formatVersionUpdatedAt(versionDetails.find(value => value.version === row)?.updated_at)}</td>}
        {versionMode && <td><button type="button" className="delete-button" disabled={busy || pendingVersion !== null} aria-label={`${phase}_${row} 삭제`} onClick={() => removeVersion(row)}>삭제</button></td>}
        {!versionMode && <td><div className="row-actions">{editing === row ? <>
          <button type="button" className="secondary-button" onClick={() => {setEditing(null); setError("");}}>Cancel</button>
          <button type="button" onClick={saveName}>Save as</button>
        </> : <>
          <button type="button" disabled={editing !== null} onClick={() => {setEditing(row); setEditName(row); setError(""); setNotice("");}}>Edit</button>
          {allowDelete && <button type="button" className="delete-button" aria-label={`${row} 삭제`} disabled={editing !== null} onClick={() => {
            if (confirmLeave && !confirmLeave()) return;
            onDelete(row); setRows(current => current.filter(item => item !== row)); setError(""); setNotice(`${row} 항목을 삭제했습니다.`);
          }}>Del</button>}
        </>}</div></td>}
      </tr>)}{!rows.length && <tr><td colSpan={versionMode ? 4 : 3}>등록된 항목이 없습니다. 아래에서 추가해 주세요.</td></tr>}</tbody>
    </table></div>
    {versionMode ? <div className="option-new version-add-actions">
      <button type="button" disabled={busy} aria-pressed={pendingVersion === nextVersions.minor} onClick={() => prepareVersion(nextVersions.minor)} title={`추가할 버전: ${nextVersions.minor} (+${nextVersions.increment})`}>Minor 버전 추가</button>
      <button type="button" disabled={busy} aria-pressed={pendingVersion === nextVersions.major} onClick={() => prepareVersion(nextVersions.major)} title={`추가할 버전: ${nextVersions.major}`}>주요 버전 추가</button>
    </div> : <form className="option-new" onSubmit={async event => {
      event.preventDefault(); const value = newName.trim();
      if (!valid(value)) return;
      if (confirmLeave && !confirmLeave()) return;
      if (productMode) {
        setBusy(true); setError("");
        try {await registerRoadmapProduct(value);}
        catch (reason) {setError(reason instanceof Error ? reason.message : "제품 추가에 실패했습니다."); setBusy(false); return;}
        setBusy(false);
      }
      const next = [...rows, value]; onSave(next, undefined, value); setRows(next); setNewName(""); setError(""); setNotice("새 항목과 순서를 저장했습니다.");
    }}>
      <label>새 {title}명<input maxLength={120} required value={newName} onChange={event => {setNewName(event.target.value); setError(""); setNotice("");}} /></label>
      <button disabled={busy || editing !== null}>추가</button>
    </form>}
    {versionMode && pendingVersion && <form className="version-create-panel" onSubmit={event => {event.preventDefault(); void addVersion(pendingVersion);}}>
      <label>버전 종류<select disabled={busy} value={pendingVersion === nextVersions.major ? "major" : "minor"} onChange={event => prepareVersion(event.target.value === "major" ? nextVersions.major : nextVersions.minor)}>
        <option value="minor">Minor 버전 · {nextVersions.minor}</option>
        <option value="major">주요 버전 · {nextVersions.major}</option>
      </select></label>
      <strong>신규 버전: {phase}_{pendingVersion}</strong>
      <label>내용 채우기<select disabled={busy} value={copyContent ? "copy" : "empty"} onChange={event => setCopyContent(event.target.value === "copy")}>
        <option value="empty">빈 버전으로 추가</option><option value="copy" disabled={!rows.length}>기존 버전 내용 복사</option>
      </select></label>
      {copyContent && <>
        <label>복사할 버전<select required disabled={busy} value={copySource} onChange={event => setCopySource(event.target.value)}>
          {copyVersions.map(row => <option key={row} value={row}>{phase}_{row}</option>)}
        </select></label>
        <p>같은 Phase의 모든 제품·Build에 저장된 내용을 복사합니다. 원본과 저장하지 않은 편집 내용은 변경하지 않습니다.</p>
      </>}
      <div className="row-actions"><button type="submit" disabled={busy || (copyContent && !copySource)}>{busy ? "추가 중…" : "버전 생성"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => {setPendingVersion(null); setError("");}}>취소</button></div>
    </form>}
    {error && <p className="selection-error" role="alert">{error}</p>}
    <footer className="option-dialog-footer"><p role="status">{dirty ? "저장하지 않은 변경 내용이 있습니다." : notice}</p>
      {!versionMode && <button type="button" disabled={busy || !orderChanged || editing !== null} onClick={() => {onSave(rows); setNotice("순서를 저장했습니다.");}}>순서 저장</button>}</footer>
  </dialog>;
}
