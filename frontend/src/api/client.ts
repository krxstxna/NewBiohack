export function getApiBase(): string {
  const { protocol, hostname, port } = window.location;
  if (port === "5173") {
    return `${protocol}//${hostname}:${port}/api`;
  }
  if (port === "8000") {
    return `${protocol}//${hostname}:${port}/api`;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}:8000/api`;
  }
  return `${window.location.origin}/api`;
}

export async function parseApiResponse(res: Response) {
  try {
    return await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
}

export function formatApiError(data: unknown, status: number): string {
  const d = data as { detail?: string | { msg: string }[] };
  if (typeof d?.detail === "string") return d.detail;
  if (Array.isArray(d?.detail)) return d.detail.map((x) => x.msg).join(", ");
  return `Request failed (${status})`;
}
