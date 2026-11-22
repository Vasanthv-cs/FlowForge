import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

async function main() {
  const config = loadConfig();
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`🚀 FlowForge Backend API running on ${address}`);
  } catch (err) {
    console.error('Failed to start FlowForge Backend API server:', err);
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nStopping FlowForge API server (${signal})...`);
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
