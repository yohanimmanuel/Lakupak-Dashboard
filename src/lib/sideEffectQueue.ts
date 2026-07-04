type SideEffectJob = {
  name: string;
  run: () => Promise<void>;
  attemptsLeft: number;
  nextDelayMs: number;
};

const globalForQueue = globalThis as unknown as {
  __lakuSideEffectQueue?: {
    running: boolean;
    jobs: SideEffectJob[];
  };
};

function getQueue() {
  if (!globalForQueue.__lakuSideEffectQueue) {
    globalForQueue.__lakuSideEffectQueue = { running: false, jobs: [] };
  }
  return globalForQueue.__lakuSideEffectQueue;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function drainQueue() {
  const q = getQueue();
  if (q.running) return;
  q.running = true;
  try {
    // Run sequentially to avoid bursty websocket/cache storms.
    while (q.jobs.length > 0) {
      const job = q.jobs.shift()!;
      try {
        await job.run();
      } catch (err) {
        if (job.attemptsLeft > 0) {
          job.attemptsLeft -= 1;
          const delay = Math.min(job.nextDelayMs, 30_000);
          job.nextDelayMs = Math.min(job.nextDelayMs * 2, 30_000);
          // eslint-disable-next-line no-console
          console.warn(`[sideEffectQueue] ${job.name} failed; retrying in ${delay}ms`, err);
          await sleep(delay);
          q.jobs.unshift(job);
        } else {
          // eslint-disable-next-line no-console
          console.error(`[sideEffectQueue] ${job.name} failed; giving up`, err);
        }
      }
    }
  } finally {
    q.running = false;
  }
}

export function enqueueSideEffect(
  name: string,
  run: () => Promise<void>,
  opts?: { retries?: number; initialDelayMs?: number },
) {
  const q = getQueue();
  q.jobs.push({
    name,
    run,
    attemptsLeft: Math.max(0, opts?.retries ?? 2),
    nextDelayMs: Math.max(0, opts?.initialDelayMs ?? 250),
  });

  // Fire-and-forget drain.
  void drainQueue();
}

/**
 * Wait until the queue has no pending jobs and no drain in progress.
 * Intended for tests: call before tearing down the DB so post-commit side effects
 * (buyer sync, notifications) finish against still-existing rows instead of racing
 * table truncation. Polls with a timeout so a stuck retry cannot hang the suite.
 */
export async function waitForSideEffectQueueIdle(timeoutMs = 15_000): Promise<void> {
  const q = getQueue();
  const start = Date.now();
  while ((q.running || q.jobs.length > 0) && Date.now() - start < timeoutMs) {
    await sleep(25);
  }
}

