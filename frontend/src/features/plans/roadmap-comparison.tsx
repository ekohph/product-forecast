"use client";

import { useState } from "react";
import type { RoadmapIdentity, RoadmapCatalog } from "@/types/roadmaps";
import type { RoadmapMonth } from "./roadmap-months";
import { SelectionBar } from "./selection-bar";
import { ComparisonResults } from "./comparison-results";
import { comparisonSelection } from "./comparison-selection";

export function RoadmapComparison({baseline, options, months}: {baseline: RoadmapIdentity; options: RoadmapCatalog; months: RoadmapMonth[]}) {
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  return <section className="roadmap-comparison" aria-label="로드맵 비교 선택">
    <h2>비교할 제품 로드맵을 선택하세요</h2>
    <SelectionBar initialSelection={baseline} availableOptions={options} idPrefix="compare-select">{(target, targetOptions, ready) => {
      const {complete, identical, pairKey} = comparisonSelection(baseline, target);
      const canCompare = ready && complete && !identical && months.length > 0;
      return <>
        <div className="comparison-actions">
          {identical && <p className="comparison-warning" role="alert">비교 기준과 동일합니다</p>}
          {!complete && <p role="status">제품, Phase, Version을 모두 선택하세요.</p>}
          <button type="button" disabled={!canCompare} onClick={() => {
            if (!canCompare) return;
            setConfirmed(pairKey);
            setRun(value => value + 1);
          }}>비교</button>
        </div>
        {canCompare && confirmed === pairKey && <ComparisonResults key={`${pairKey}:${run}`} baseline={baseline} target={target} baselineBuilds={options.build} targetBuilds={targetOptions.build} />}
      </>;
    }}</SelectionBar>
  </section>;
}
