import type { RoadmapIdentity } from "@/types/roadmaps";

export const comparisonFields = ["product", "phase", "version"] as const;

export function comparisonBuilds(baseline: string[], target: string[]) {
  return [...new Set([...baseline, ...target])].map(build => ({build, inBaseline: baseline.includes(build), inTarget: target.includes(build)}));
}
export function comparisonSelection(baseline: RoadmapIdentity, target: RoadmapIdentity) {
  const complete = comparisonFields.every(field => Boolean(baseline[field].trim() && target[field].trim()));
  const identical = complete && comparisonFields.every(field => baseline[field] === target[field]);
  return {complete, identical, pairKey: JSON.stringify(comparisonFields.map(field => [baseline[field], target[field]]))};
}
