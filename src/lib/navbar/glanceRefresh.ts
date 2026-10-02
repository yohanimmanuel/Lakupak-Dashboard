const GLANCE_REFRESH_EVENT = 'laku-glance-refresh';

/** Ask the navbar to reload review-queue counts after a workflow status change. */
export function requestGlanceRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GLANCE_REFRESH_EVENT));
}

export function subscribeGlanceRefresh(onRefresh: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onRefresh();
  window.addEventListener(GLANCE_REFRESH_EVENT, handler);
  return () => window.removeEventListener(GLANCE_REFRESH_EVENT, handler);
}
