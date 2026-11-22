export type Version = { id: string; name: string; content: string };
export type Phase = { id: string; name: string; version_id: string | null };
export type Plan = { id: string; name: string; product_name: string; versions: Version[]; phases: Phase[] };
