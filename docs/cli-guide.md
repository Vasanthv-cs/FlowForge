# FlowForge CLI Guide

The FlowForge CLI (`@flowforge/cli`) provides a command-line interface for managing, validating, pulling, and deploying workflows directly from developer environments and CI/CD pipelines.

---

## 1. Installation & Global Usage

The FlowForge CLI is bundled in the monorepo at `packages/cli` and registered in `package.json`:

```bash
# Run directly with npm
npm run cli -- <command> [flags]

# Run using npx / tsx
npx tsx packages/cli/src/index.ts <command> [flags]

# Or link globally
npm link packages/cli
flowforge <command> [flags]
```

Verify installation:
```bash
flowforge --version
flowforge --help
```

---

## 2. Authentication & Configuration

The CLI authenticates with the FlowForge Fastify API via JWT bearer tokens and persists configuration in `~/.flowforge/config.json`.

### Login Command

```bash
flowforge login --url http://localhost:3001 --token <your-jwt-token> --workspace <workspace-uuid>
```

**Options**:
- `--url <api-url>`: Fastify backend URL (defaults to `http://localhost:3001`).
- `--token <jwt>`: FlowForge user session JWT token.
- `--workspace <uuid>`: Default active workspace ID for subsequent commands.

### Security & Token Masking
- The configuration file `~/.flowforge/config.json` is saved with restrictive POSIX file mode **`0600`** (read/write only by owner).
- Tokens are **never logged or printed in plaintext**. The CLI masks tokens (e.g. `eyJh...3456`) across stdout and error streams.
- Environment variables (`FLOWFORGE_API_URL`, `FLOWFORGE_TOKEN`, `FLOWFORGE_WORKSPACE`) can be used in CI/CD without writing to disk.

---

## 3. Workflow Commands

### `workflow list`
Lists all cloud workflows in the active or specified workspace:

```bash
flowforge workflow list
flowforge workflow list --workspace <workspace-id>
flowforge workflow list --json
```

**Output Example**:
```text
Workflows in workspace 11111111-1111-4111-8111-111111111111 (3):

ID                                   | NAME                                    | UPDATED
-------------------------------------+-----------------------------------------+-------------------------
9a4b2c8e-3241-45cd-8a2b-10f438910001 | Customer Onboarding Pipeline            | 11/24/2026, 2:30:15 PM
bc439810-7fa9-432a-bf31-50e419820002 | Daily Database Backup Poller            | 11/24/2026, 1:15:00 PM
```

### `workflow pull`
Downloads a remote workflow definition into a local JSON file:

```bash
flowforge workflow pull <workflow-id>
flowforge workflow pull <workflow-id> --out ./workflows/my-pipeline.json
```

Sensitive credentials and secret headers are automatically redacted prior to writing to disk.

### `workflow push`
Uploads a local workflow definition JSON to the cloud workspace.

```bash
flowforge workflow push ./workflows/my-pipeline.json
```

#### Safe Overwrite Protection
To prevent accidental destruction of production workflows, `workflow push` performs a conflict check:
- If a workflow with the same ID or name already exists in the workspace, `push` aborts with an informative conflict error:

```text
Conflict Error: Workflow "Customer Onboarding Pipeline" already exists in workspace (ID: 9a4b2c8e...).
To safely overwrite this workflow, re-run with --overwrite or --force:
  flowforge workflow push "./workflows/my-pipeline.json" --overwrite
```

- With `--overwrite` or `--force`, the existing workflow definition is safely updated.

### `workflow validate`
Validates a local workflow JSON file against the FlowForge schema, DAG structure, node library, and environment variables:

```bash
flowforge workflow validate ./workflows/pipeline.json
flowforge workflow validate ./workflows/pipeline.json --json
flowforge workflow validate ./workflows/pipeline.json --env .env.json
```

**Checks Performed**:
1. **JSON Schema**: Node and edge integrity.
2. **DAG Structure**: Detects cycles and disconnected fragments.
3. **Node Types**: Ensures all nodes belong to registered FlowForge node executors.
4. **Secrets Detection**: Catches hardcoded API keys or bearer tokens.
5. **Environment Configuration**: Checks required `{{env.VAR_NAME}}` placeholders against environment files.

### `workflow export`
Exports a clean workflow file suitable for version control:

```bash
flowforge workflow export <workflow-id> --out ./release-v1.json
```

All credentials and private secrets are stripped, while node configurations, graph connections, and environment variable references are preserved.

---

## 4. CI/CD Integration Example

```yaml
# GitHub Actions / GitLab CI Example
name: Workflow CI/CD
on:
  push:
    branches: [ main ]

jobs:
  validate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # 1. Validate workflow JSON
      - name: Validate Workflows
        run: npx tsx packages/cli/src/index.ts workflow validate ./workflows/lead-intake.json

      # 2. Deploy to Production Workspace
      - name: Deploy Workflow
        env:
          FLOWFORGE_API_URL: ${{ secrets.FLOWFORGE_PROD_URL }}
          FLOWFORGE_TOKEN: ${{ secrets.FLOWFORGE_SERVICE_TOKEN }}
          FLOWFORGE_WORKSPACE: ${{ secrets.FLOWFORGE_WORKSPACE_ID }}
        run: |
          npx tsx packages/cli/src/index.ts workflow push ./workflows/lead-intake.json --overwrite
```
