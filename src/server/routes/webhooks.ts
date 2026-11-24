import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from '../services/webhookService';

export const webhookRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * Common handler for incoming public webhook calls.
   */
  const handleIncomingWebhook = async (
    request: FastifyRequest<{ Params: { path: string } }>,
    reply: FastifyReply
  ) => {
    const { path } = request.params;

    try {
      const result = await webhookService.handleWebhook({
        path,
        method: request.method,
        headers: request.headers as Record<string, string | string[] | undefined>,
        query: (request.query || {}) as Record<string, unknown>,
        body: request.body,
        rawBody: typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {}),
      });

      if (result.respondMode === 'sync') {
        const isSuccess = result.runResult?.success ?? (result.status === 'success');

        // Check if a webhook-response node executed and produced custom response data
        const nodeRecords = result.runResult?.nodeRecords || {};
        const webhookResponseRecord = Object.values(nodeRecords).find(
          (r) => r.nodeType === 'webhook-response' && r.state === 'success' && r.outputData?._webhookResponse
        );

        if (webhookResponseRecord?.outputData) {
          const respData = webhookResponseRecord.outputData as {
            statusCode?: number;
            headers?: Record<string, string>;
            body?: string;
          };
          const status = respData.statusCode || 200;
          if (respData.headers && typeof respData.headers === 'object') {
            for (const [hk, hv] of Object.entries(respData.headers)) {
              if (hk && hv !== undefined) reply.header(hk, String(hv));
            }
          }
          let responsePayload: unknown = respData.body;
          try {
            if (typeof respData.body === 'string' && respData.body.trim()) {
              responsePayload = JSON.parse(respData.body);
            }
          } catch {
            // Keep as string
          }
          return reply.status(status).send(responsePayload);
        }

        return reply.status(isSuccess ? 200 : 500).send({
          success: isSuccess,
          executionId: result.executionId,
          status: result.status,
          result: result.runResult,
        });
      }

      // Default: immediate asynchronous enqueue
      return reply.status(202).send({
        success: true,
        message: 'Webhook accepted and workflow execution queued',
        executionId: result.executionId,
        status: result.status,
        path,
      });
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode || 500;
      const message = err instanceof Error ? err.message : 'Internal webhook processing error';

      return reply.status(statusCode).send({
        success: false,
        statusCode,
        error: message,
      });
    }
  };

  // Register HTTP verbs for webhook triggers
  app.post('/api/webhooks/:path', handleIncomingWebhook);
  app.get('/api/webhooks/:path', handleIncomingWebhook);
  app.put('/api/webhooks/:path', handleIncomingWebhook);
};
