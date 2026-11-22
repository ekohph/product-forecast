import { RoadmapWorkspace } from "@/features/plans/roadmap-workspace";

export default function Home() {
  return (
    <main>
      <p className="eyebrow">Product Forecast</p>
      <h1>제품 로드맵 관리</h1>
      <p className="intro">제품 로드맵 버전을 관리하고 버전을 비교하세요.</p>
      <RoadmapWorkspace />
    </main>
  );
}
