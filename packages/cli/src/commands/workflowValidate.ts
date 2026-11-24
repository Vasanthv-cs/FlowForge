import fs from 'node:fs';
import path from 'node:path';
import { validateImportedWorkflow, KNOWN_NODE_TYPES, type SavedWorkflow } from '@flowforge/workflow-schema';
import { analyzeWorkflowGraph, detectRequiredEnvVars, validateWorkflowEnvironment } from '@flowforge/workflow-core';
import { exitOrThrow } from '../config';

export interface WorkflowValidateOptions {
  json?: boolean;
  env?: string;
}

export async function workflowValidateCommand(
  filePath: string,
  options: WorkflowValidateOptions = {}
): Promise<void> {
  if (!filePath) {
    exitOrThrow('Error: File path is required. Usage: flowforge workflow validate <file.json>');
  }

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    exitOrThrow(`Error: File not found at ${resolved}`);
  }

  let json: unknown;
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    json = JSON.parse(raw);
  } catch (err) {
    exitOrThrow(`\nValidation FAILED: Invalid JSON file: ${(err as Error).message}`);
  }

  const validation = validateImportedWorkflow<SavedWorkflow>(json);
  if (!validation.success || !validation.data) {
    exitOrThrow(`\nValidation FAILED: Schema errors detected:\n  ${validation.error}`);
  }

  const wf = validation.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Graph DAG analysis
  const graphAnalysis = analyzeWorkflowGraph(wf.nodes, wf.edges);
  if (!graphAnalysis.isValid) {
    errors.push(...graphAnalysis.errors);
  }

  // Node types and secrets analysis
  for (const node of wf.nodes) {
    const type = node.data?.type;
    if (!type || !KNOWN_NODE_TYPES.has(type)) {
      errors.push(`Unrecognized node type "${type}" in node "${node.data?.label || node.id}".`);
    }

    const configStr = JSON.stringify(node.data?.config || {});
    if (/sk_live_[0-9a-zA-Z]{20,}/.test(configStr)) {
      errors.push(`Hardcoded live production secret detected in node "${node.data?.label || node.id}".`);
    }
    if (/Bearer\s+[A-Za-z0-9\-_]{25,}/i.test(configStr)) {
      warnings.push(`Hardcoded bearer token found in node "${node.data?.label || node.id}". Use credential vault instead.`);
    }
  }

  // Environment variables
  let envDict: Record<string, string | undefined> = process.env;
  if (options.env) {
    const envFilePath = path.resolve(process.cwd(), options.env);
    if (!fs.existsSync(envFilePath)) {
      exitOrThrow(`Environment file not found: ${envFilePath}`);
    }
    try {
      envDict = JSON.parse(fs.readFileSync(envFilePath, 'utf8'));
    } catch (e) {
      exitOrThrow(`Failed to parse environment file as JSON: ${(e as Error).message}`);
    }
  }

  const envVars = detectRequiredEnvVars(wf);
  const envReport = validateWorkflowEnvironment(wf, envDict);
  if (options.env && envReport.missingVars.length > 0) {
    errors.push(`Missing required environment variables: ${envReport.missingVars.join(', ')}`);
  }

  if (options.json) {
    const output = {
      isValid: errors.length === 0,
      name: wf.name,
      nodeCount: wf.nodes.length,
      edgeCount: wf.edges.length,
      requiredEnvVars: envVars,
      missingEnvVars: envReport.missingVars,
      errors,
      warnings,
    };
    console.log(JSON.stringify(output, null, 2));
    if (errors.length > 0) {
      exitOrThrow(
        `Environment validation failed: ${errors.join(', ')}`
      );
    }
    return;
  }

  console.log(`\nValidation Report for "${wf.name}" (${path.basename(filePath)}):`);
  console.log('------------------------------------------------------------');
  console.log(`  Nodes:                 ${wf.nodes.length}`);
  console.log(`  Edges:                 ${wf.edges.length}`);
  console.log(`  DAG Graph Structure:   ${graphAnalysis.isValid ? '✓ Valid (Acyclic)' : '✗ Invalid'}`);
  console.log(`  Required Env Vars:     ${envVars.length > 0 ? envVars.join(', ') : 'None'}`);

  if (envReport.missingVars.length > 0) {
    console.log(`  Missing in Host Env:   ⚠️  ${envReport.missingVars.join(', ')}`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
  }

  if (errors.length > 0) {
    console.error('\nErrors:');
    errors.forEach((e) => console.error(`  ✗  ${e}`));
    console.error('\nResult: FAILED');
    exitOrThrow('Validation FAILED');
  }

  console.log('\nResult: ✓ PASSED (Workflow definition is valid and deployable)');
}
