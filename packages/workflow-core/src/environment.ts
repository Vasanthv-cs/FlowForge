export interface WorkflowEnvironmentReport {
  isValid: boolean;
  requiredVars: string[];
  missingVars: string[];
  presentVars: string[];
}

const ENV_VAR_REGEX = /\{\{env\.([A-Za-z0-9_]+)\}\}/g;

/**
 * Recursively scans an object for {{env.VAR_NAME}} placeholders.
 */
function extractEnvVarsFromValue(val: unknown, collected: Set<string>): void {
  if (typeof val === 'string') {
    const matches = val.matchAll(ENV_VAR_REGEX);
    for (const m of matches) {
      if (m[1]) collected.add(m[1]);
    }
  } else if (Array.isArray(val)) {
    for (const item of val) {
      extractEnvVarsFromValue(item, collected);
    }
  } else if (val && typeof val === 'object') {
    for (const v of Object.values(val as Record<string, unknown>)) {
      extractEnvVarsFromValue(v, collected);
    }
  }
}

/**
 * Scans a workflow definition (nodes, configs) and extracts all required environment variables.
 */
export function detectRequiredEnvVars(
  workflow: { nodes: Array<{ data?: { label?: string; config?: unknown } }>; edges?: unknown[] }
): string[] {
  const collected = new Set<string>();

  for (const node of workflow.nodes) {
    if (node.data?.label) {
      extractEnvVarsFromValue(node.data.label, collected);
    }
    if (node.data?.config) {
      extractEnvVarsFromValue(node.data.config, collected);
    }
  }

  return Array.from(collected).sort();
}

/**
 * Validates whether all required environment variables for a workflow are provided.
 */
export function validateWorkflowEnvironment(
  workflow: { nodes: Array<{ data?: { label?: string; config?: unknown } }>; edges?: unknown[] },
  envValues: Record<string, string | undefined> = process.env
): WorkflowEnvironmentReport {
  const required = detectRequiredEnvVars(workflow);
  const missing: string[] = [];
  const present: string[] = [];

  for (const v of required) {
    if (envValues[v] !== undefined && envValues[v] !== '') {
      present.push(v);
    } else {
      missing.push(v);
    }
  }

  return {
    isValid: missing.length === 0,
    requiredVars: required,
    missingVars: missing,
    presentVars: present,
  };
}

/**
 * Recursively interpolates {{env.VAR_NAME}} tokens with values from envValues.
 */
function interpolateValue(val: unknown, envValues: Record<string, string | undefined>): unknown {
  if (typeof val === 'string') {
    return val.replace(ENV_VAR_REGEX, (_match, varName) => {
      const resolved = envValues[varName];
      return resolved !== undefined ? resolved : `{{env.${varName}}}`;
    });
  }
  if (Array.isArray(val)) {
    return val.map((item) => interpolateValue(item, envValues));
  }
  if (val && typeof val === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      res[k] = interpolateValue(v, envValues);
    }
    return res;
  }
  return val;
}

/**
 * Interpolates all environment placeholders in node configurations.
 */
export function interpolateWorkflowEnvironment<TWorkflow extends { nodes: any[]; edges: any[]; name?: string; id?: string }>(
  workflow: TWorkflow,
  envValues: Record<string, string | undefined> = process.env
): TWorkflow {
  const cloned = JSON.parse(JSON.stringify(workflow)) as TWorkflow;

  for (const node of cloned.nodes) {
    if (node.data) {
      if (node.data.label) {
        node.data.label = interpolateValue(node.data.label, envValues) as string;
      }
      if (node.data.config) {
        node.data.config = interpolateValue(node.data.config, envValues) as Record<string, unknown>;
      }
    }
  }

  return cloned;
}
