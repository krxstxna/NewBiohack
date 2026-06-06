import { getApiBase, formatApiError, parseApiResponse } from "../api/client";
import type { Metrics } from "../types/profile";

export interface LabReport {
  filename?: string;
  report_type?: string;
  summary?: string;
  markers?: Record<string, unknown>;
}

export interface LabUploadResult {
  files_processed?: string[];
  files_failed?: { filename: string }[];
  lab_reports?: LabReport[];
  genes?: Record<string, { phenotype?: string; variant?: string }>;
}

export interface SessionSnapshot {
  has_profile?: boolean;
  has_metrics?: boolean;
  has_genes?: boolean;
  has_lab_reports?: boolean;
  profile?: unknown;
  metrics?: Metrics;
  history?: { role: string; content: string }[];
  lab_reports?: LabReport[];
  genes?: Record<string, unknown>;
  history_length?: number;
}

const REPORT_LABELS: Record<string, string> = {
  bloodwork: "Bloodwork",
  genetic: "Genetic",
  ancestry: "Ancestry",
  microbiome: "Microbiome",
  other: "Lab report",
};

export function reportLabel(type?: string) {
  return REPORT_LABELS[type || ""] || "Lab report";
}

export function labUploadSummary(data: LabUploadResult) {
  const reports = data.lab_reports || [];
  const geneCount = Object.keys(data.genes || {}).length;
  const markerCount = reports.reduce((n, r) => n + Object.keys(r.markers || {}).length, 0);
  const parts = [`${reports.length} report(s)`];
  if (markerCount) parts.push(`${markerCount} marker(s)`);
  if (geneCount) parts.push(`${geneCount} gene(s)`);
  return parts.join(" · ");
}

export function formatFetchError(err: unknown) {
  if (err instanceof Error && err.message === "Failed to fetch") {
    return `Could not reach the backend. Start it with: cd backend && python main.py`;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

export async function fetchSession(): Promise<SessionSnapshot> {
  const res = await fetch(`${getApiBase()}/session`);
  return parseApiResponse(res);
}

export async function clearSession() {
  await fetch(`${getApiBase()}/session`, { method: "DELETE" });
}

export async function uploadLabReports(files: File[]): Promise<LabUploadResult> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch(`${getApiBase()}/upload/lab-reports/batch`, { method: "POST", body: form });
  const data = await parseApiResponse(res);
  if (!res.ok) throw new Error(formatApiError(data, res.status));
  return data;
}

export async function uploadAppleHealth(file: File, clientUserId: string): Promise<{ metrics: Metrics; junction?: { sources?: string[]; errors?: string[] } }> {
  const form = new FormData();
  form.append("file", file);
  if (clientUserId) form.append("client_user_id", clientUserId);
  const res = await fetch(`${getApiBase()}/upload/apple-health`, { method: "POST", body: form });
  const data = await parseApiResponse(res);
  if (!res.ok) throw new Error(formatApiError(data, res.status));
  return data;
}

export async function connectJunctionWearable(
  provider: string,
  clientUserId: string,
): Promise<{
  metrics?: Metrics;
  link_web_url?: string;
  junction?: { sources?: string[]; errors?: string[]; connected_providers?: string[] };
  connection?: { mode?: string };
}> {
  const form = new FormData();
  form.append("provider", provider);
  form.append("client_user_id", clientUserId || "genofit-local");
  form.append(
    "redirect_url",
    `${window.location.origin}${window.location.pathname}?junction_provider=${encodeURIComponent(provider)}`,
  );
  const res = await fetch(`${getApiBase()}/junction/connect`, { method: "POST", body: form });
  const data = await parseApiResponse(res);
  if (!res.ok) throw new Error(formatApiError(data, res.status));
  return data;
}

export async function syncJunctionWearables(clientUserId: string) {
  const form = new FormData();
  if (clientUserId) form.append("client_user_id", clientUserId);
  const res = await fetch(`${getApiBase()}/junction/sync`, { method: "POST", body: form });
  const data = await parseApiResponse(res);
  if (!res.ok) throw new Error(formatApiError(data, res.status));
  return data as { metrics?: Metrics; junction?: { sources?: string[]; errors?: string[]; connected_providers?: string[] } };
}

export function metricsStatus(metrics: Metrics | undefined, junction?: { sources?: string[]; errors?: string[] }) {
  const count = Object.keys(metrics || {}).filter((k) => !k.startsWith("junction_") && k !== "sources").length;
  let status = count ? `${count} metrics synced` : "Connected";
  if (junction?.sources?.length) status += ` · Junction (${junction.sources.join(", ")})`;
  if (junction?.errors?.length) status += ` · ${junction.errors[0]}`;
  return status;
}
