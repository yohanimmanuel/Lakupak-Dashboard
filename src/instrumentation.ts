export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateDashboardEnv } = await import('./lib/validateEnv');
    validateDashboardEnv();

    const phase = process.env.NEXT_PHASE ?? '';
    if (!phase.startsWith('phase-') && process.env.VERCEL !== '1') {
      const { startAutomationScheduler } = await import('./lib/automations/scheduler');
      startAutomationScheduler();
    }
  }
}
