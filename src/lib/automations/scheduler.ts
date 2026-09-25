// Poll every 30 seconds instead of 5 seconds to reduce idle database load on shared-CPU deployments.
const TICK_MS = 30_000;

const globalForScheduler = globalThis as unknown as {
  __lakuAutomationTimer?: ReturnType<typeof setInterval>;
  __lakuAutomationTicking?: boolean;
};

export async function tickAutomations(): Promise<{
  checked: number;
  fired: number;
  cartIdle: { checked: number; fired: number };
}> {
  if (globalForScheduler.__lakuAutomationTicking) {
    return {
      checked: 0,
      fired: 0,
      cartIdle: { checked: 0, fired: 0 },
    };
  }
  globalForScheduler.__lakuAutomationTicking = true;
  try {
    const { dispatchDueCartIdleAutomations } = await import('@/lib/automations/engine');
    const cartIdle = await dispatchDueCartIdleAutomations();
    return {
      checked: cartIdle.checked,
      fired: cartIdle.fired,
      cartIdle,
    };
  } finally {
    globalForScheduler.__lakuAutomationTicking = false;
  }
}

/** Local `next dev` / long-lived Node. Vercel serverless uses /api/cron/automations instead. */
export function startAutomationScheduler(): void {
  if (globalForScheduler.__lakuAutomationTimer) return;
  const tick = () => {
    void tickAutomations().catch((err) => {
      console.error('[automations] scheduler tick failed', err);
    });
  };
  tick();
  globalForScheduler.__lakuAutomationTimer = setInterval(tick, TICK_MS);
  globalForScheduler.__lakuAutomationTimer.unref?.();
}
