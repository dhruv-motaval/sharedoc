export async function api(method, path, body) {
  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body && (isForm ? body : JSON.stringify(body)),
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Check your connection.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

// SQLite datetime('now') is UTC without a zone marker.
export function timeAgo(sqlDate) {
  const s = (Date.now() - new Date(sqlDate.replace(' ', 'T') + 'Z')) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
