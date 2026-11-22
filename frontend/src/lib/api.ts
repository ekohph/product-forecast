import { API_PATH } from "./paths";
import type { HealthResponse } from "@/types/health";
import type { Plan } from "@/types/plans";
import type { RoadmapCatalog, RoadmapIdentity, RoadmapRecord, RoadmapVersionInfo } from "@/types/roadmaps";
import type { RoadmapTableData } from "@/features/plans/build-table";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_PATH}${path}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("서비스에 연결할 수 없습니다. 다시 불러와 저장 여부를 확인해 주세요.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : "요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.");
  }
  return response.json();
}

export const listPlans = () => request<Plan[]>("/plans");
export const getRoadmapCatalog = (phase?: string, product?: string) => request<RoadmapCatalog>(`/roadmaps/catalog?${new URLSearchParams({...phase && {phase}, ...product && {product}})}`);
export const registerRoadmapProduct = (product: string) => request<{builds: string[]}>("/roadmaps/products", "POST", {product});
export const saveProductBuilds = (product: string, builds: string[], previous_builds: string[]) => request<{builds: string[]}>("/roadmaps/products/builds", "PUT", {product, builds, previous_builds});
export const getPhaseVersions = (phase: string) => request<RoadmapVersionInfo[]>(`/roadmaps/versions?${new URLSearchParams({phase})}`);
export const advanceRoadmapPhase = (data: {product: string; phase: string; version: string; target_phase: string; target_version: string; builds: {build: string; revision: number; data: RoadmapTableData}[]}) => request<{ok: boolean; build_count: number}>("/roadmaps/advance-phase", "POST", data);
export const addPhaseVersion = (phase: string, version: string, copy_from?: string) => request<{ok: boolean; updated_at: string; roadmap_count: number}>("/roadmaps/versions", "POST", {phase, version, copy_from});
export const previewVersionDeletion = (phase: string, version: string) => request<{roadmap_count: number; token: string; has_note: boolean}>(`/roadmaps/versions/deletion?${new URLSearchParams({phase, version})}`);
export const saveVersionContent = (phase: string, version: string, content: string, previous_content: string) => request<{content: string; updated_at: string}>("/roadmaps/versions/content", "PATCH", {phase, version, content, previous_content});
export const deletePhaseVersion = (phase: string, version: string, token: string, confirmed: boolean) => request<{ok: boolean}>("/roadmaps/versions", "DELETE", {phase, version, token, confirmed});
export const getRoadmap = (identity: RoadmapIdentity) => request<RoadmapRecord>(`/roadmaps?${new URLSearchParams(identity)}`);
export const saveRoadmap = (identity: RoadmapIdentity, data: RoadmapTableData, revision: number) => request<RoadmapRecord>(`/roadmaps?${new URLSearchParams(identity)}`, "PUT", {data, revision});
export const createPlan = (data: {name: string; product_name: string}) => request<Plan>("/plans", "POST", data);
export const addVersion = (id: string, data: {name: string; content: string}) => request<Plan>(`/plans/${id}/versions`, "POST", data);
export const addPhase = (id: string, name: string) => request<Plan>(`/plans/${id}/phases`, "POST", {name});
export const renamePhase = (id: string, phase: string, name: string) => request<Plan>(`/plans/${id}/phases/${phase}`, "PATCH", {name});
export const selectVersion = (id: string, phase: string, version_id: string | null) => request<Plan>(`/plans/${id}/phases/${phase}/selection`, "PUT", {version_id});

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_PATH}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("status" in data) ||
      data.status !== "ok" || !("service" in data) || typeof data.service !== "string") {
    throw new Error("Unexpected health response");
  }
  return { status: data.status, service: data.service };
}
