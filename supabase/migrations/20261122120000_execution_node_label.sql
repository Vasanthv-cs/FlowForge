-- ------------------------------------------------------------------------------
-- Migration: Add node_label column to public.node_executions
-- FlowForge: Stage 10, Batch 5 (Execution History & Run Logs)
-- ------------------------------------------------------------------------------

alter table public.node_executions
add column if not exists node_label text;
