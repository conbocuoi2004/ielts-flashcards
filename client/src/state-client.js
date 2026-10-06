export async function stateRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Không lưu được dữ liệu vào database.');
    error.status = response.status;
    throw error;
  }
  return result;
}

// One writer per page: rapid ratings must not send older snapshots after newer ones.
export function createStateSync(initialRevision, onStatus, request = stateRequest) {
  let revision = initialRevision;
  let pending = null;
  let running = false;
  let failed = false;
  async function flush() {
    if (running || failed || !pending) return;
    running = true;
    onStatus('Đang lưu…', null);
    try {
      while (pending) {
        const current = pending;
        pending = null;
        try {
          const saved = await request('/api/state', {
            method: 'PUT', body: JSON.stringify({ state: current, revision }),
          });
          revision = saved.revision;
        } catch (error) {
          pending ||= current;
          failed = true;
          onStatus('Chưa lưu vào database', error.message);
          return;
        }
      }
      onStatus('Đã lưu vào database', null);
    } finally { running = false; }
  }
  return {
    enqueue(state) { pending = state; void flush(); },
    retry() { failed = false; void flush(); },
  };
}
