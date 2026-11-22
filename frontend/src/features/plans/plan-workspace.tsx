"use client";

import { useEffect, useState, type FormEvent } from "react";
import { addPhase, addVersion, createPlan, listPlans, renamePhase, selectVersion } from "@/lib/api";
import type { Phase, Plan } from "@/types/plans";

export function PlanWorkspace() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const plan = plans.find(p => p.id === selected);

  async function load() {
    setPending(true); setError(""); setNotice("");
    try {
      const data = await listPlans();
      setPlans(data); setSelected(current => data.some(p => p.id === current) ? current : data[0]?.id ?? "");
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  useEffect(() => { void load(); }, []);

  async function save(action: () => Promise<Plan>, reset?: () => void) {
    setPending(true); setError(""); setNotice("");
    try {
      const updated = await action();
      setPlans(current => current.some(p => p.id === updated.id)
        ? current.map(p => p.id === updated.id ? updated : p) : [updated, ...current]);
      setSelected(updated.id); setNotice("저장했습니다."); reset?.();
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<Plan>) {
    e.preventDefault(); const form = e.currentTarget;
    void save(() => action(new FormData(form)), () => form.reset());
  }

  return <section aria-label="제품 계획 관리">
    <div className="toolbar"><p role="status">{pending ? "처리 중…" : notice}</p><button disabled={pending} onClick={() => void load()}>다시 불러오기</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <fieldset disabled={pending} className="workspace-fields">
      <div className="workspace-grid">
        <aside className="panel">
          <h2>신규 제품 계획</h2>
          <form onSubmit={e => submit(e, data => createPlan({product_name: String(data.get("product")), name: String(data.get("name"))}))}>
            <label>제품명<input name="product" required maxLength={120} placeholder="제품명을 입력하세요" /></label>
            <label>계획명<input name="name" required maxLength={120} placeholder="계획명을 입력하세요" /></label>
            <button>계획 생성</button>
          </form>
          <h2 className="section-title">저장된 계획 <small>{plans.length}</small></h2>
          {!plans.length && <p>아직 저장된 계획이 없습니다.</p>}
          <div className="plan-list">{plans.map(p => <button key={p.id} aria-pressed={selected === p.id} onClick={() => { setSelected(p.id); setNotice(""); }}><strong>{p.product_name}</strong><span>{p.name}</span></button>)}</div>
        </aside>
        {plan ? <div className="plan-detail" key={plan.id}>
          <section className="panel"><p className="eyebrow">{plan.product_name}</p><h2>{plan.name}</h2>
            <p>각 Phase에서 사용할 버전을 선택하세요. 선택한 내용은 아래에 표시됩니다.</p>
            <div className="phases">{plan.phases.map(phase => <PhaseCard key={phase.id} plan={plan} phase={phase} save={save} />)}</div>
            <form className="inline-form" onSubmit={e => submit(e, data => addPhase(plan.id, String(data.get("name"))))}>
              <label>새 Phase 이름<input name="name" required maxLength={120} /></label><button>Phase 추가</button>
            </form>
          </section>
          <section className="panel"><h2>버전 추가</h2><p>저장된 버전의 내용은 보존됩니다. 변경안은 새 버전으로 추가하세요.</p>
            <form onSubmit={e => submit(e, data => addVersion(plan.id, {name: String(data.get("name")), content: String(data.get("content"))}))}>
              <label>버전명<input name="name" required maxLength={120} placeholder="예: v1, 고객 검토안" /></label>
              <label>계획 내용<textarea name="content" rows={6} maxLength={20000} placeholder="제품 계획의 내용과 가정을 작성하세요" /></label><button>버전 저장</button>
            </form>
            <h3>저장된 버전 ({plan.versions.length})</h3>
            {!plan.versions.length && <p>첫 버전을 추가한 후 Phase에 지정하세요.</p>}
            {plan.versions.map(v => <details key={v.id}><summary>{v.name}</summary><p className="version-content">{v.content || "작성된 내용이 없습니다."}</p></details>)}
          </section>
        </div> : <section className="panel empty"><h2>제품 계획을 시작하세요</h2><p>신규 제품의 계획을 생성하면 기본 Phase 3개가 준비됩니다.</p></section>}
      </div>
    </fieldset>
  </section>;
}

function PhaseCard({plan, phase, save}: {plan: Plan; phase: Phase; save: (action: () => Promise<Plan>) => Promise<void>}) {
  const version = plan.versions.find(v => v.id === phase.version_id);
  return <article className="phase-card">
    <h3>{phase.name}</h3>
    <label>선택 버전<select value={phase.version_id ?? ""} onChange={e => void save(() => selectVersion(plan.id, phase.id, e.target.value || null))}>
      <option value="">미선택</option>{plan.versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select></label>
    <p className="version-content">{version ? version.content || "작성된 내용이 없습니다." : "버전을 선택해 주세요."}</p>
    <details><summary>Phase 이름 편집</summary><form onSubmit={e => {
      e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name"));
      void save(() => renamePhase(plan.id, phase.id, name));
    }}><label>Phase 이름<input key={phase.name} name="name" required maxLength={120} defaultValue={phase.name} /></label><button>이름 저장</button></form></details>
  </article>;
}
