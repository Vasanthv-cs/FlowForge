import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '@flowforge/node-sdk';
import type { WebhookResponseConfig } from '@flowforge/workflow-schema';

export class WebhookResponseExecutor implements NodeExecutor {
  async execute(context: ExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.data.config as unknown as WebhookResponseConfig;
    const {
      statusCode = 200,
      headers = { 'Content-Type': 'application/json' },
      body = '{\n  "status": "success"\n}',
    } = config || {};

    context.emitLog(
      'info',
      `Webhook Response node configured status ${statusCode} with ${Object.keys(headers).length} header(s).`
    );

    return {
      success: true,
      output: {
        statusCode,
        headers,
        body,
        _webhookResponse: true,
      },
    };
  }
}
