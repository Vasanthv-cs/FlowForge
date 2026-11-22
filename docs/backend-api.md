# FlowForge Backend API Foundation (Fastify)

This document describes the architecture, configuration, security mechanisms, API routes, and testing procedures for the FlowForge server-side API service.

---

## 1. Architecture Overview

The FlowForge Backend API is built on [Fastify v5](https://fastify.dev/) and TypeScript. It is designed to run alongside the Vite frontend to provide privileged, server-side orchestration, workspace RBAC enforcement, execution history retrieval, and secure server-side workflow execution (Batch 6B).

### Modular Architecture
```
src/server/
├── index.ts                     # CLI executable entry point with graceful shutdown
├── app.ts                       # Fastify application factory (CORS, Rate Limiting, Routes)
├── config.ts                    # Strict Zod environment variable parsing
├── logger.ts                    # Structured Pino logger with sensitive field redaction
├── types.ts                     # TypeScript declarations & FastifyRequest augmentations
├── supabase.ts                  # Server-side Supabase client & JWT verification
├── middleware/
│   ├── auth.ts                  # Bearer token authentication preHandler
│   └── rbac.ts                  # Workspace membership & role-based access control
├── routes/
│   ├── health.ts                # Liveness (/health) & Readiness (/ready) probes
│   └── workspaces.ts            # Workspace-scoped workflows and execution logs
└── services/
    └── workspaceService.ts      # Workspace-scoped database queries & ID isolation
```

---

## 2. Environment Configuration

All backend environment variables are defined in `.env.example` and read securely on the server. Privileged credentials like `SUPABASE_SERVICE_ROLE_KEY` must **never** be prefixed with `VITE_` or exposed to the browser.

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | number | `3001` | TCP port for the Fastify server |
| `HOST` | string | `127.0.0.1` | Network interface to bind to (`0.0.0.0` for containers) |
| `NODE_ENV` | string | `development` | Environment mode (`development`, `production`, `test`) |
| `SUPABASE_URL` | string | `https://rnkaowxaaxdzumliicku.supabase.co` | Supabase project API URL |
| `SUPABASE_ANON_KEY` | string | - | Public anon key (used for scoped queries) |
| `SUPABASE_SERVICE_ROLE_KEY` | string | - | **Server-only** privileged service role key |
| `CORS_ORIGIN` | string | `http://localhost:5173` | Allowed frontend origin for CORS |
| `RATE_LIMIT_MAX` | number | `100` | Max requests per minute per IP address |
| `BODY_LIMIT` | number | `1048576` (1MB) | Maximum payload size for JSON request bodies |

---

## 3. Authentication & Authorization

### Authentication (`middleware/auth.ts`)
- **Header:** `Authorization: Bearer <Supabase-JWT-Access-Token>`
- Validates the cryptographic token signature, expiration date, and revocation status directly with the Supabase Auth server.
- Derives user identity strictly from the verified JWT payload (`user.id`, `user.email`).
- Client-supplied identity headers or user IDs are strictly ignored.
- Returns `401 Unauthorized` for missing, malformed, expired, or invalid tokens.

### Workspace RBAC (`middleware/rbac.ts`)
Every workspace-scoped route enforces role permissions:
- Roles: `owner`, `admin`, `developer`, `viewer`.
- **Read Access:** `owner`, `admin`, `developer`, `viewer` are permitted to inspect workflows and executions.
- **Write/Execute Access:** `owner`, `admin`, `developer` only. If a user with the `viewer` role attempts a write or execute operation, the server rejects the request with `403 Forbidden` (`Access denied: Viewers have read-only access and cannot modify or execute workflows`).
- **Cross-Workspace ID Isolation:** Workflows and executions are filtered strictly by `workspace_id`. If an attacker requests a workflow or execution ID that belongs to another workspace, the server returns `404 Not Found`, preventing metadata probing and ID manipulation.

---

## 4. API Endpoints

### System Health
- **`GET /health`**
  - **Auth:** Public
  - **Response:** `200 OK`
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 142,
    "timestamp": "2026-11-22T21:10:00.000Z",
    "service": "flowforge-backend-api",
    "version": "0.1.0"
  }
  ```

- **`GET /ready`**
  - **Auth:** Public
  - **Response:** `200 OK` (when database connectivity probe succeeds) or `503 Service Unavailable` (when database is unreachable).
  ```json
  {
    "status": "ready",
    "database": "connected",
    "latencyMs": 12,
    "timestamp": "2026-11-22T21:10:00.000Z"
  }
  ```

### Workspaces & Workflows
- **`GET /api/workspaces/:workspaceId/workflows`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ workflows: WorkflowListItem[] }`

- **`GET /api/workspaces/:workspaceId/workflows/:workflowId`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ workflow: WorkflowDetail }` or `404 Not Found`

- **`POST /api/workspaces/:workspaceId/workflows`**
  - **Auth:** Bearer Token (`owner`, `admin`, `developer` only)
  - **Body:** `{ "name": "ETL Pipeline", "description": "...", "definition": { ... } }`
  - **Response:** `201 Created` `{ workflow: ... }`

### Execution History
- **`GET /api/workspaces/:workspaceId/executions?status=success&limit=50&offset=0`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ executions: ExecutionListItem[] }`

- **`GET /api/workspaces/:workspaceId/executions/:executionId`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ execution: ExecutionDetail }` (with node execution logs, timeline events, and deeply redacted secrets).

---

## 5. Security Safeguards

1. **Sensitive Log Redaction:**
   Pino logger is configured to redact all sensitive paths including:
   `req.headers.authorization`, `req.headers.cookie`, `password`, `token`, `secret`, `apiKey`.
2. **Deep Payload Redaction:**
   Execution records returned via API endpoints pass through `redactSensitiveData` to scrub nested auth tokens, API keys, and client secrets.
3. **Rate Limiting:**
   Fastify rate limiting blocks brute-force authentication and API flooding.
4. **Body Limits:**
   Payload size is restricted to 1MB to prevent memory exhaustion attacks.

---

## 6. Running and Testing

### Development
Start the backend server in watch mode:
```bash
npm run server:dev
```

Start the standalone production server:
```bash
npm run server
```

### Testing
Run backend unit and integration test suite:
```bash
npx vitest run src/__tests__/backendApiAndAuth.test.ts
```

Run all unit, integration, and E2E test suites:
```bash
npm test
npm run test:e2e
```
