import { loginCommand } from './commands/login';
import { workflowListCommand } from './commands/workflowList';
import { workflowPullCommand } from './commands/workflowPull';
import { workflowPushCommand } from './commands/workflowPush';
import { workflowValidateCommand } from './commands/workflowValidate';
import { workflowExportCommand } from './commands/workflowExport';

export const VERSION = '0.1.0';

const BOOLEAN_FLAGS = new Set(['help', 'h', 'version', 'v', 'json', 'overwrite', 'force']);

export interface ParsedCliArgs {
  command: string;
  subcommand?: string;
  fullCommand: string;
  positionals: string[];
  args: string[];
  flags: Record<string, string | boolean>;
  options: Record<string, string | boolean>;
}

export function parseArgs(rawArgs: string[]): ParsedCliArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        flags[k] = v;
      } else if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        flags[key] = rawArgs[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
        flags[key] = rawArgs[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
    i++;
  }

  const command = positionals[0] || '';
  const subcommand = positionals[1];
  const remaining = positionals.slice(2);

  return {
    command,
    subcommand,
    fullCommand: subcommand ? `${command} ${subcommand}` : command,
    positionals: remaining,
    args: remaining,
    flags,
    options: flags,
  };
}

export function printHelp(): void {
  console.log(`
FlowForge CLI v${VERSION} — Developer Automation & Workflow Management

USAGE:
  flowforge <command> [subcommand] [arguments] [flags]

COMMANDS:
  login                        Authenticate CLI with API URL and Token
    --token <jwt>              Bearer access token
    --url <api-url>            Fastify API URL (default: http://localhost:3001)
    --workspace <workspace-id> Default active workspace UUID

  workflow list                List all cloud workflows in workspace
    --workspace <id>           Target workspace UUID

  workflow pull <id>           Download remote workflow definition to local JSON
    --workspace <id>           Target workspace UUID
    --out <file.json>          Output file path

  workflow push <file.json>    Upload local workflow JSON to workspace
    --workspace <id>           Target workspace UUID
    --overwrite, --force       Permit overwriting an existing workflow

  workflow validate <file>     Validate local workflow schema, DAG, node types & env vars
  workflow export <id>         Export workflow without secrets to clean JSON file
    --workspace <id>           Target workspace UUID
    --out <file.json>          Output destination

GLOBAL FLAGS:
  --help, -h                   Show this help message
  --version, -v                Print CLI version
`);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.flags.help || parsed.flags.h || (!parsed.command && !parsed.subcommand)) {
    printHelp();
    return;
  }

  if (parsed.flags.version || parsed.flags.v) {
    console.log(`flowforge v${VERSION}`);
    return;
  }

  try {
    switch (parsed.command) {
      case 'login': {
        await loginCommand({
          token: typeof parsed.flags.token === 'string' ? parsed.flags.token : undefined,
          url: typeof parsed.flags.url === 'string' ? parsed.flags.url : undefined,
          workspace: typeof parsed.flags.workspace === 'string' ? parsed.flags.workspace : undefined,
        });
        break;
      }

      case 'workflow': {
        switch (parsed.subcommand) {
          case 'list': {
            await workflowListCommand({
              workspace: typeof parsed.flags.workspace === 'string' ? parsed.flags.workspace : undefined,
            });
            break;
          }

          case 'pull': {
            const wfId = parsed.positionals[0];
            await workflowPullCommand(wfId, {
              workspace: typeof parsed.flags.workspace === 'string' ? parsed.flags.workspace : undefined,
              out: typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
            });
            break;
          }

          case 'push': {
            const filePath = parsed.positionals[0];
            await workflowPushCommand(filePath, {
              workspace: typeof parsed.flags.workspace === 'string' ? parsed.flags.workspace : undefined,
              overwrite: Boolean(parsed.flags.overwrite),
              force: Boolean(parsed.flags.force),
            });
            break;
          }

          case 'validate': {
            const filePath = parsed.positionals[0];
            await workflowValidateCommand(filePath, {
              json: Boolean(parsed.flags.json),
              env: typeof parsed.flags.env === 'string' ? parsed.flags.env : undefined,
            });
            break;
          }

          case 'export': {
            const wfId = parsed.positionals[0];
            await workflowExportCommand(wfId, {
              workspace: typeof parsed.flags.workspace === 'string' ? parsed.flags.workspace : undefined,
              out: typeof parsed.flags.out === 'string' ? parsed.flags.out : undefined,
            });
            break;
          }

          default: {
            console.error(`Unknown workflow subcommand: "${parsed.subcommand}". Run "flowforge --help" for usage.`);
            process.exit(1);
          }
        }
        break;
      }

      default: {
        console.error(`Unknown command: "${parsed.command}". Run "flowforge --help" for usage.`);
        process.exit(1);
      }
    }
  } catch (err: unknown) {
    console.error(`\nError: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Execute if run directly from node CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('cli')) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
