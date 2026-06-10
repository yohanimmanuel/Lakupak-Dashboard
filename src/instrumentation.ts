export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateDashboardEnv } = await import('./lib/validateEnv');
    validateDashboardEnv();
  }
}
