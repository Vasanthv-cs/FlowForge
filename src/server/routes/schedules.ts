import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.ts';
import { requireWorkspaceRole, READ_ROLES, WRITE_ROLES } from '../middleware/rbac.ts';
import { scheduleService } from '../services/scheduleService.ts';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createScheduleBodySchema = z.object({
  workflowId: z.string().regex(UUID_REGEX, 'workflowId must be a valid UUID'),
  name: z.string().min(1, 'Schedule name cannot be empty').max(100),
  scheduleType: z.enum(['one_time', 'recurring']),
  cronExpression: z.string().optional(),
  oneTimeRunAt: z.string().optional(),
  timezone: z.string().default('UTC'),
  missedRunPolicy: z.enum(['skip', 'run_once']).default('skip'),
});

const updateScheduleBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scheduleType: z.enum(['one_time', 'recurring']).optional(),
  cronExpression: z.string().optional(),
  oneTimeRunAt: z.string().optional(),
  timezone: z.string().optional(),
  missedRunPolicy: z.enum(['skip', 'run_once']).optional(),
});

export const scheduleRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  /**
   * POST /api/workspaces/:workspaceId/schedules
   * Creates a new one-time or recurring schedule.
   * Enforces WRITE_ROLES (rejects Viewers with 403).
   */
  app.post(
    '/api/workspaces/:workspaceId/schedules',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const parseResult = createScheduleBodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      const schedule = await scheduleService.createSchedule(workspaceId, {
        ...parseResult.data,
        userId: request.user?.id,
      });

      return reply.status(201).send({ schedule });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/schedules
   * Lists all schedules for a workspace. Optional ?workflowId= filter.
   */
  app.get(
    '/api/workspaces/:workspaceId/schedules',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const { workflowId } = (request.query || {}) as { workflowId?: string };

      if (workflowId && !UUID_REGEX.test(workflowId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid workflowId filter.',
        });
      }

      const schedules = await scheduleService.listSchedules(workspaceId, workflowId);
      return reply.status(200).send({ schedules });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/schedules/:scheduleId
   * Gets details for a single schedule. Enforces workspace isolation.
   */
  app.get(
    '/api/workspaces/:workspaceId/schedules/:scheduleId',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId. Must be a valid UUID.',
        });
      }

      const schedule = await scheduleService.getSchedule(workspaceId, scheduleId);
      if (!schedule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Schedule not found in this workspace.',
        });
      }

      return reply.status(200).send({ schedule });
    }
  );

  /**
   * PUT /api/workspaces/:workspaceId/schedules/:scheduleId
   * Updates an existing schedule. Enforces WRITE_ROLES.
   */
  app.put(
    '/api/workspaces/:workspaceId/schedules/:scheduleId',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId. Must be a valid UUID.',
        });
      }

      const parseResult = updateScheduleBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          issues: parseResult.error.issues,
        });
      }

      const schedule = await scheduleService.updateSchedule(workspaceId, scheduleId, parseResult.data);
      return reply.status(200).send({ schedule });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/schedules/:scheduleId/pause
   * Pauses an active schedule.
   */
  app.post(
    '/api/workspaces/:workspaceId/schedules/:scheduleId/pause',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId.',
        });
      }

      const schedule = await scheduleService.pauseSchedule(workspaceId, scheduleId);
      return reply.status(200).send({ schedule, message: 'Schedule paused successfully.' });
    }
  );

  /**
   * POST /api/workspaces/:workspaceId/schedules/:scheduleId/resume
   * Resumes a paused schedule and reconciles next_run_at.
   */
  app.post(
    '/api/workspaces/:workspaceId/schedules/:scheduleId/resume',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId.',
        });
      }

      const schedule = await scheduleService.resumeSchedule(workspaceId, scheduleId);
      return reply.status(200).send({ schedule, message: 'Schedule resumed successfully.' });
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/schedules/:scheduleId
   * Deletes a schedule.
   */
  app.delete(
    '/api/workspaces/:workspaceId/schedules/:scheduleId',
    {
      preHandler: [authenticate, requireWorkspaceRole(WRITE_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId.',
        });
      }

      await scheduleService.deleteSchedule(workspaceId, scheduleId);
      return reply.status(200).send({ success: true, message: 'Schedule deleted successfully.' });
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/schedules/:scheduleId/executions
   * Lists past executions dispatched by this schedule.
   */
  app.get(
    '/api/workspaces/:workspaceId/schedules/:scheduleId/executions',
    {
      preHandler: [authenticate, requireWorkspaceRole(READ_ROLES)],
    },
    async (request, reply) => {
      const { workspaceId, scheduleId } = request.params as {
        workspaceId: string;
        scheduleId: string;
      };

      if (!UUID_REGEX.test(scheduleId)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid scheduleId.',
        });
      }

      const executions = await scheduleService.getScheduleExecutions(workspaceId, scheduleId);
      return reply.status(200).send({ executions });
    }
  );
};
