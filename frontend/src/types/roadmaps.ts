import type { RoadmapTableData } from "@/features/plans/build-table";

export type RoadmapIdentity = {product: string; build: string; phase: string; version: string};
export type RoadmapRecord = {revision: number; data: RoadmapTableData | null; updated_at: string | null};
export type RoadmapCatalog = Record<keyof RoadmapIdentity, string[]>;
export type RoadmapVersionInfo = {version: string; updated_at: string | null; roadmap_count: number; has_content?: boolean; content?: string};
