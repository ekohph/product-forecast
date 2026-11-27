"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getRoadmap, getRoadmapCatalog } from "@/lib/api";
import type { RoadmapMonth } from "./roadmap-months";
import { buildProductTimeline, sharedTimelineMonths, type BuildSchedule } from "./product-timeline";
import { RoadmapTimeline, type TimelineSizes } from "./roadmap-timeline";
import { TimelineDisplayOptions, TimelineDownload } from "./timeline-controls";

type ProductSchedule = {product: string; schedules: BuildSchedule[]; error?: string};

async function mapLimited<T, R>(values: T[], limit: number, convert: (value: T) => Promise<R>) {
  const results: R[] = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(limit, values.length)}, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await convert(values[index]);
    }
  }));
  return results;
}

export function PortfolioTimeline({products, phase, version, ready, months, sizes, onSizes}: {
  products: string[]; phase: string; version: string; ready: boolean; months: RoadmapMonth[];
  sizes: TimelineSizes; onSizes: (sizes: TimelineSizes) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [attempt, retry] = useState(0);
  const [load, setLoad] = useState<{key: string; rows: ProductSchedule[]} | null>(null);
  const productsKey = JSON.stringify(products);
  const key = JSON.stringify([phase, version, productsKey, attempt]);
  useEffect(() => {
    if (!ready || !phase || !version) return;
    let active = true;
    const names = JSON.parse(productsKey) as string[];
    const failText = (reason: unknown) => reason instanceof Error ? reason.message : "일정을 불러오지 못했습니다.";
    void (async () => {
      const catalogs = await mapLimited(names, 6, async product => {
        if (!active) return {product, builds: [] as string[]};
        try {return {product, builds: (await getRoadmapCatalog(undefined, product)).build};}
        catch (reason) {return {product, builds: [] as string[], error: failText(reason)};}
      });
      if (!active) return;
      const items = catalogs.flatMap(({product, builds}) => builds.map(build => ({product, build})));
      const drafts = new Map<string, ProductSchedule>(catalogs.map(({product, error}) => [product, {product, error, schedules: []}]));
      await mapLimited(items, 6, async ({product, build}) => {
        if (!active) return;
        const row = drafts.get(product)!;
        try {
          const {data} = await getRoadmap({product, build, phase, version});
          if (data) row.schedules.push({build, months: data.months, items: data.items});
        } catch (reason) {row.error = failText(reason);}
      });
      if (active) setLoad({key, rows: [...drafts.values()].map(row => ({
        ...row, schedules: catalogs.find(catalog => catalog.product === row.product)!.builds
          .flatMap(build => row.schedules.filter(schedule => schedule.build === build)),
      }))});
    })();
    return () => {active = false;};
  }, [ready, phase, version, productsKey, key]);

  const rows = load?.key === key ? load.rows : null;
  const timeline = useMemo(() => {
    const available = rows?.filter(row => !row.error) ?? [];
    const shared = sharedTimelineMonths(available.flatMap(row => row.schedules.flatMap(schedule => schedule.months)), months);
    return new Map(available.map(row => [row.product, buildProductTimeline(row.schedules, months, shared)]));
  }, [rows, months]);
  const valid = !!(ready && phase && version && months.length);
  const selected = products.filter(product => selection.has(product) && timeline.has(product));
  return <>
    <div className="roadmap-heading view-heading">
      <h2>제품 일정 모아보기</h2><span className="timeline-phase" style={{fontSize: sizes.phase}}>{phase || "Phase 없음"}</span><span>· Version {version}</span>
      <TimelineDisplayOptions sizes={sizes} onSizes={onSizes} />
      <TimelineDownload root={root} selected={selected} title="제품 일정 모아보기" phase={phase} version={version} phaseSize={sizes.phase} disabled={!valid} />
    </div>
    {!valid ? <p role="status">Phase·Version과 저장소 연결을 확인해 주세요.</p>
      : !products.length ? <p role="status">표시할 제품이 없습니다.</p>
      : !rows ? <p role="status">제품별 일정을 불러오고 있습니다.</p>
      : <div ref={root} className="build-timelines portfolio-timelines">
        {rows.map(({product, error}) => {
          const plan = timeline.get(product);
          return <div key={product} data-export-build={product} className="selectable-timeline product-timeline-overview">
            <label className="timeline-check">
              <input type="checkbox" aria-label={`${product} 타임라인 다운로드 선택`} disabled={!plan} checked={!!plan && selection.has(product)}
                onChange={event => {
                  const checked = event.currentTarget.checked;
                  setSelection(current => {const next = new Set(current); if (checked) next.add(product); else next.delete(product); return next;});
                }} />
              <span>{product}</span>
            </label>
            {plan ? <RoadmapTimeline months={plan.months} items={plan.items} build={product} compact showBuildLabel={false} sizes={sizes}
              emptyLabel="저장된 일정이 없습니다." /> : <div className="timeline-status-row">
              <div><p role="alert">{error || "제품 일정을 불러오지 못했습니다."}</p>
                <button type="button" onClick={() => retry(current => current + 1)}>다시 시도</button></div>
            </div>}
          </div>;
        })}
      </div>}
  </>;
}
