# FlowForge Environment Configuration & Safe Promotion Guide

This guide explains how FlowForge handles environment variables, configuration placeholders, and safe workflow promotion across development, staging, and production environments.

---

## 1. Principles of Environment Separation

FlowForge enforces a clear separation between **workflow structure**, **environment parameters**, and **secret credentials**:

| Category | Description | Storage / Mechanism |
|---|---|---|
| **Workflow Definition** | Topology, node connections, step logic, data mappings | Stored in workflow JSON / version snapshots |
| **Environment Configuration** | Hostnames, base URLs, timeouts, feature toggles | Parameterized via `{{env.VAR_NAME}}` placeholders |
| **Confidential Secrets** | API keys, OAuth tokens, passwords, bearer credentials | Stored encrypted in the workspace Credential Vault |

> [!IMPORTANT]
> Workflow JSON files intended for version control must **never** contain plaintext passwords, API keys, or personal access tokens. Use the Credential Vault or environment variable references.

---

## 2. Using Environment Placeholders (`{{env.VAR_NAME}}`)

Workflows can reference environment variables anywhere in node labels and string configurations using double-curly syntax:

```json
{
  "id": "http-query-node",
  "type": "workflowNode",
  "data": {
    "label": "Call {{env.TARGET_SERVICE}} API",
    "type": "http-request",
    "config": {
      "url": "https://{{env.API_HOST}}/v1/records",
      "timeout": 5000,
      "headers": {
        "X-Environment": "{{env.ENVIRONMENT_NAME}}"
      }
    }
  }
}
```

### Supported Syntax
- `{{env.VAR_NAME}}`: Only alphanumeric characters and underscores are permitted within the variable name.
- Multiple placeholders can appear in the same string: `https://{{env.HOST}}:{{env.PORT}}/{{env.PREFIX}}`.
- Unresolved placeholders remain unaltered if not provided in the environment dictionary.

---

## 3. Detecting & Validating Environment Variables

FlowForge provides core utilities (`@flowforge/workflow-core`) and CLI commands to inspect and validate required variables:

### Programmatic Inspection
```typescript
import { detectRequiredEnvVars, validateWorkflowEnvironment, interpolateWorkflowEnvironment } from '@flowforge/workflow-core';

// 1. Detect variables
const required = detectRequiredEnvVars(workflow);
// -> ['API_HOST', 'ENVIRONMENT_NAME', 'TARGET_SERVICE']

// 2. Validate current environment
const report = validateWorkflowEnvironment(workflow, process.env);
if (!report.isValid) {
  console.error('Missing variables:', report.missingVars);
}

// 3. Runtime interpolation
const resolvedWorkflow = interpolateWorkflowEnvironment(workflow, process.env);
```

### CLI Validation
```bash
# Validate against current host process environment
flowforge workflow validate ./pipeline.json

# Validate against specific JSON environment definition
flowforge workflow validate ./pipeline.json --env ./config/staging.env.json
```

---

## 4. Promotion Between Environments (Dev -> Staging -> Prod)

By parameterizing hostnames and endpoints with `{{env.VAR_NAME}}` and referencing credentials by vault credential IDs or names:

1. **Development Canvas**:
   - A developer creates and tests the workflow in their personal or development workspace.
   - Credentials reference development sandbox keys in the local Credential Vault.
2. **Export to Git**:
   - The developer runs `flowforge workflow export <wf-id> --out ./workflows/lead-pipeline.json`.
   - The export tool automatically redacts any ad-hoc sensitive tokens.
3. **CI / CD Validation**:
   - The CI runner runs `flowforge workflow validate ./workflows/lead-pipeline.json --env .env.prod.json`.
   - Any missing environment variable or cycle is caught before deployment.
4. **Production Deployment**:
   - The CI runner authenticates with a production service token and runs:
     `flowforge workflow push ./workflows/lead-pipeline.json --workspace <prod-workspace-id> --overwrite`
   - The workflow in production immediately connects to production endpoints and the production Credential Vault.
