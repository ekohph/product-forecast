"use client";

import {useEffect, useState} from "react";
import {getFeatures, saveFeatures, type FeatureList, type ProductFeature} from "@/lib/api";

export function FeaturesPanel({products, onDirty}: {products: string[]; onDirty: (dirty: boolean) => void}) {
  const [saved, setSaved] = useState<FeatureList | null>(null);
  const [draft, setDraft] = useState<ProductFeature[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved?.features);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    let active = true;
    getFeatures().then(data => {if (active) {setSaved(data); setDraft(null); setError("");}})
      .catch(reason => {if (active) setError(reason.message);});
    return () => {active = false;};
  }, [attempt]);

  function patch(id: string, values: Partial<ProductFeature>) {
    setDraft(rows => rows?.map(row => row.id === id ? {...row, ...values} : row) ?? null);
  }
  async function save() {
    if (!saved || !draft) return;
    setBusy(true); setError("");
    try {
      setSaved(await saveFeatures({revision: saved.revision, features: draft}));
      setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장에 실패했습니다.");
    } finally {setBusy(false);}
  }
  const rows = draft ?? saved?.features ?? [];
  return <div className="features-panel">
    <div className="features-actions"><h2>기능 목록</h2>
      {saved && (draft === null
        ? <button onClick={() => setDraft(saved.features)}>편집</button>
        : <><button className="secondary-button" disabled={busy} onClick={() => setDraft([...draft, {
          id: Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"), name: "", description: "", products: [],
        }])}>기능 추가</button>
          <button disabled={!dirty || busy || draft.some(row => !row.name.trim())} onClick={save}>저장</button>
          <button className="secondary-button" disabled={busy} onClick={() => {setDraft(null); setError("");}}>취소</button></>)}
    </div>
    {error && <p role="alert">{error} <button onClick={() => {
      if (!dirty || window.confirm("편집 내용을 버리고 최신 목록을 불러올까요?")) {
        setSaved(null); setDraft(null); setError(""); setAttempt(value => value + 1);
      }
    }}>다시 불러오기</button></p>}
    {!saved && !error && <p role="status">기능 목록을 불러오는 중입니다.</p>}
    {saved && !rows.length && <p>등록된 기능이 없습니다.</p>}
    {rows.length > 0 && <div className="feature-table-wrap"><table className="feature-table">
      <thead><tr><th>기능명</th><th>설명</th><th>적용 제품</th>{draft && <th>삭제</th>}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{draft ? <input aria-label="기능명" maxLength={120} value={row.name} disabled={busy} onChange={e => patch(row.id, {name: e.target.value})}/> : row.name}</td>
        <td>{draft ? <textarea aria-label="기능 설명" rows={2} maxLength={2000} value={row.description} disabled={busy} onChange={e => patch(row.id, {description: e.target.value})}/> : row.description}</td>
        <td>{draft ? <div className="feature-products">{Array.from(new Set([...products, ...row.products])).map(product =>
          <label key={product}><input type="checkbox" checked={row.products.includes(product)} disabled={busy} onChange={e => patch(row.id, {
            products: e.target.checked ? [...row.products, product] : row.products.filter(p => p !== product),
          })}/>{product}</label>)}</div> : row.products.join(", ") || "미지정"}</td>
        {draft && <td><button className="secondary-button" disabled={busy} aria-label={`${row.name || "새 기능"} 삭제`} onClick={() => setDraft(draft.filter(f => f.id !== row.id))}>삭제</button></td>}
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
