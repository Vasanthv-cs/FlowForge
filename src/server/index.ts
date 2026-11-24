import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { executionEngineService } from './services/executionEngineService.ts';
import { durableWorker } from './services/durableWorkerService.ts';
import { workflowSchedulerService } from './services/workflowSchedulerService.ts';

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  // Reconcile any stale executions from previous server crash or restart
  try {
    const { reconciledCount } = await executionEngineService.reconcileStaleExecutions();
    if (reconciledCount > 0) {
      console.log(`[FlowForge] Reconciled ${reconciledCount} interrupted execution(s) from previous session.`);
    }
  } catch (err) {
    console.warn('[FlowForge] Could not reconcile stale executions on startup:', err);
  }

  // Start background durable worker queue consumer and cron scheduler
  try {
    await durableWorker.start();
    console.log(`[FlowForge] Durable queue worker started (ID: ${durableWorker.workerId})`);
    workflowSchedulerService.start();
    console.log('[FlowForge] Cron workflow scheduler started');
  } catch (err) {
    console.warn('[FlowForge] Could not start background worker or scheduler:', err);
  }

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 FlowForge Backend API running on ${address} (env: ${config.NODE_ENV})`);
  } catch (err) {
    console.error('Failed to start FlowForge Backend API server:', err);
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nStopping FlowForge API server (${signal})...`);
      workflowSchedulerService.stop();
      await durableWorker.stop();
      executionEngineService.abortAllActive(`Server stopping (${signal})`);
      await app.close();
      process.exit(0);
    });
  }
}

// Only auto-start when invoked directly from CLI
if (process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('index.js')) {
  main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

export { buildApp };
