const TICK_MS = 5_000;

const globalForScheduler = globalThis as unknown as {
  __lakuCampaignScheduleTimer?: ReturnType<typeof setInterval>;
  __lakuCampaignScheduleTicking?: boolean;
};

export async function tickCampaignSchedules(): Promise<{ checked: number; fired: number }> {
  if (globalForScheduler.__lakuCampaignScheduleTicking) {
    return { checked: 0, fired: 0 };
  }
  globalForScheduler.__lakuCampaignScheduleTicking = true;
  try {
    // Import on each tick so `next dev` HMR does not keep a stale send-one-campaign copy.
    const { dispatchDueCampaignScheduleAutomations } = await import(
      '@/lib/automations/engine'
    );
    return await dispatchDueCampaignScheduleAutomations();
  } finally {
    globalForScheduler.__lakuCampaignScheduleTicking = false;
  }
}

/** Local `next dev` / long-lived Node. Vercel serverless uses /api/cron/automations instead. */
export function startAutomationScheduler(): void {
  if (globalForScheduler.__lakuCampaignScheduleTimer) return;
  const tick = () => {
    void tickCampaignSchedules().catch((err) => {
      console.error('[automations] campaign schedule tick failed', err);
    });
  };
  tick();
  globalForScheduler.__lakuCampaignScheduleTimer = setInterval(tick, TICK_MS);
  globalForScheduler.__lakuCampaignScheduleTimer.unref?.();
}
