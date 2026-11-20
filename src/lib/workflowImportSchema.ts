import { z } from 'zod';
import type { SavedWorkflow } from '@/store/persistence';

export const importedNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  type: z.string().default('workflowNode'),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.object({
    label: z.string().default('Untitled Node'),
    type: z.string(),
    category: z.enum(['trigger', 'data', 'logic', 'utility']).default('utility'),
    description: z.string().default(''),
    icon: z.string().default('Play'),
    color: z.string().default('#3b82f6'),
    config: z.record(z.string(), z.unknown()).default({}),
    inputs: z.array(z.any()).default([]),
    outputs: z.array(z.any()).default([]),
    status: z.enum(['idle', 'pending', 'running', 'success', 'failed', 'skipped']).optional(),
  }),
});

export const importedEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
});

export const workflowImportSchema = z.object({
  id: z.string().default(() => `wf-${Date.now()}`),
  name: z.string().min(1, 'Workflow name is required').default('Imported Workflow'),
  nodes: z.array(importedNodeSchema),
  edges: z.array(importedEdgeSchema),
  createdAt: z.number().optional().default(() => Date.now()),
  updatedAt: z.number().optional().default(() => Date.now()),
});

export function validateImportedWorkflow(data: unknown): {
  success: boolean;
  data?: SavedWorkflow;
  error?: string;
} {
  try {
    const result = workflowImportSchema.safeParse(data);
    if (!result.success) {
      const errorMsg = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(' | ');
      return {
        success: false,
        error: `Invalid workflow schema: ${errorMsg}`,
      };
    }
    return {
      success: true,
      data: result.data as unknown as SavedWorkflow,
    };
  } catch (err) {
    return {
      success: false,
      error: `Import failure: ${err instanceof Error ? err.message : 'Unknown validation error'}`,
    };
  }
}
