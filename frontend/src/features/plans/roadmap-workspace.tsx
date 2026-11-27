"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SelectionBar } from "./selection-bar";
import { getRoadmapMonths, type RoadmapMonth } from "./roadmap-months";
import { PhaseEditor } from "./phase-editor";
import { RoadmapComparison } from "./roadmap-comparison";
import { TimelineView } from "./timeline-view";
import { PortfolioTimeline } from "./portfolio-timeline";
import { FeaturesPanel } from "./features-panel";
import { defaultTimelineSizes } from "./roadmap-timeline";
import {confirmUnsavedChanges, installUnsavedNavigationGuard} from "./unsaved-changes";

const tabGroups = [
  {name: "제품별", tabs: [{id: "view", name: "조회"}, {id: "edit", name: "편집"}, {id: "compare", name: "비교"}]},
  {name: "전체 제품", tabs: [{id: "portfolio", name: "제품 모아보기"}, {id: "features", name: "Features"}]},
];
const tabs = tabGroups.flatMap(group => group.tabs);

export function RoadmapWorkspace() {
  const [tab, setTab] = useState("view");
  const [timelineSizes, setTimelineSizes] = useState(defaultTimelineSizes);
  const dirty = useRef(false);
  const onDirty = useCallback((value: boolean) => {dirty.current = value;}, []);
  const confirmLeave = useCallback(() => confirmUnsavedChanges(dirty.current, message => window.confirm(message)), []);
  useEffect(() => installUnsavedNavigationGuard(() => dirty.current, window), []);
  const [months, setMonths] = useState<RoadmapMonth[]>([]);
  useEffect(() => {
    const update = () => setMonths(getRoadmapMonths(new Date()));
    update();
    window.addEventListener("focus", update);
    const timer = window.setInterval(update, 60000);
    return () => { window.removeEventListener("focus", update); window.clearInterval(timer); };
  }, []);

  return <SelectionBar confirmLeave={confirmLeave} sharedLink hideSelectors={tab === "features"} omitProduct={tab === "portfolio"}>{(selection, options, ready, select, manageBuilds) => <section className="roadmap-workspace" aria-label="제품 로드맵">
    <div className="roadmap-tabs" role="tablist" aria-label="로드맵 보기 방식">
      {tabGroups.map(group => <div key={group.name} className="roadmap-tab-group" role="presentation">
        {group.tabs.map(item => <button
        key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id}
        aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
        onClick={() => {if (item.id !== tab && confirmLeave()) setTab(item.id);}} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const index = tabs.indexOf(item);
          const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].id;
          if (next !== tab && !confirmLeave()) return;
          setTab(next); document.getElementById(`tab-${next}`)?.focus();
        }} aria-label={`${group.name} ${item.name}`}>{item.name}</button>)}
      </div>)}
    </div>
    {tabs.filter(item => item.id === "view" || item.id === "edit").map(panel => <div key={panel.id} id={`panel-${panel.id}`} role="tabpanel" aria-labelledby={`tab-${panel.id}`} hidden={tab !== panel.id} tabIndex={0}>
      {tab === panel.id && (panel.id === "view" ? <TimelineView key={JSON.stringify([selection.product, selection.phase, selection.version])} selection={selection} options={options} ready={ready} months={months} sizes={timelineSizes} onSizes={setTimelineSizes} /> :
        <PhaseEditor key={JSON.stringify([selection.product, selection.phase, selection.version])} selection={selection} options={options} ready={ready} months={months} onSelect={select} onDirty={onDirty} onManageBuilds={manageBuilds} />)}
    </div>)}
    <div id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={tab !== "compare"} tabIndex={0}>
      {tab === "compare" && (ready ? <RoadmapComparison baseline={selection} options={options} months={months} /> : <p role="status">저장소 연결을 확인하고 있습니다.</p>)}
    </div>
    <div id="panel-portfolio" role="tabpanel" aria-labelledby="tab-portfolio" hidden={tab !== "portfolio"} tabIndex={0}>
      {tab === "portfolio" && <PortfolioTimeline key={JSON.stringify([selection.phase, selection.version])}
        products={options.product} phase={selection.phase} version={selection.version} ready={ready}
        months={months} sizes={timelineSizes} onSizes={setTimelineSizes} />}
    </div>
    <div id="panel-features" role="tabpanel" aria-labelledby="tab-features" hidden={tab !== "features"} tabIndex={0}>
      {tab === "features" && <FeaturesPanel products={options.product} onDirty={onDirty} />}
    </div>
  </section>}</SelectionBar>;
}
