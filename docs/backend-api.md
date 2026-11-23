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

### Server-Side Workflow Execution (Batch 6B)
- **`POST /api/workspaces/:workspaceId/workflows/:workflowId/execute?wait=false`**
  - **Auth:** Bearer Token (`owner`, `admin`, `developer` only; `viewer` rejected with `403 Forbidden`).
  - **Parameters:**
    - `workspaceId`: Workspace UUID
    - `workflowId`: Workflow UUID
    - `wait`: Optional query boolean. When `true`, waits for completion and returns `200 OK` with full run results. When `false` (default), triggers execution in background and immediately returns `202 Accepted`.
  - **Body (optional):**
    ```json
    {
      "versionId": "optional-workflow-version-uuid",
      "triggerPayload": { "key": "value" }
    }
    ```
  - **Response (202 Accepted):**
    ```json
    {
      "executionId": "uuid",
      "status": "running",
      "startedAt": "2026-11-23T06:00:00.000Z",
      "workflowId": "uuid",
      "workspaceId": "uuid"
    }
    ```
  - **Security & Authorization Controls:**
    - Loads workflow definition authoritatively from the database; never trusts client-supplied graphs.
    - Validates DAG structure with cycle detection before starting.
    - Saves an immutable, redacted definition snapshot to `public.executions`.
    - Enforces workspace concurrency limits: maximum 5 active runs per workspace (returns `429 Too Many Requests` when exceeded).
    - Enforces 60-second execution timeout and bounded node concurrency (max 4 parallel nodes).

- **`GET /api/workspaces/:workspaceId/executions/:executionId/status`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK`
    ```json
    {
      "status": {
        "id": "uuid",
        "workflowId": "uuid",
        "workspaceId": "uuid",
        "status": "running | success | failed | cancelled",
        "triggerType": "manual",
        "durationMs": 1420,
        "startedAt": "2026-11-23T06:00:00.000Z",
        "finishedAt": null,
        "errorMessage": null
      }
    }
    ```

- **`POST /api/workspaces/:workspaceId/executions/:executionId/cancel`**
  - **Auth:** Bearer Token (`owner`, `admin`, `developer` only; `viewer` rejected with `403 Forbidden`).
  - **Response:** `200 OK` `{ "success": true, "message": "Workflow execution cancelled successfully." }`
  - Aborts in-flight execution via `AbortController`, halts node tasks, and marks execution status as `cancelled`.

### Execution History
- **`GET /api/workspaces/:workspaceId/executions?status=success&limit=50&offset=0`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ executions: ExecutionListItem[] }`

- **`GET /api/workspaces/:workspaceId/executions/:executionId`**
  - **Auth:** Bearer Token (Any Workspace Member)
  - **Response:** `200 OK` `{ execution: ExecutionDetail }` (with node execution logs, timeline events, and deeply redacted secrets).

---

## 5. Multi-Layer SSRF Protection (`safeHttpClient.ts`)

Outbound HTTP requests executed by the HTTP Request node on the server are secured against Server-Side Request Forgery (SSRF) and DNS rebinding attacks via a defense-in-depth architecture:

1. **Protocol and Syntax Enforcement:**
   - Permitted protocols: strictly `http:` and `https:`.
   - Embedded credentials (`http://user:pass@host`) are strictly forbidden.
   - Standard safe web ports permitted: `80`, `443`, `8080`, `8443`. Sensitive internal ports (e.g. SSH 22, SMTP 25, Redis 6379, Postgres 5432) are blocked.
2. **Comprehensive IP Range Blacklisting:**
   - IPv4 Loopback (`127.0.0.0/8`), `0.0.0.0/8`.
   - RFC 1918 Private Networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Link-Local and Cloud Metadata (`169.254.0.0/16`, specifically `169.254.169.254`).
   - Carrier-Grade NAT (`100.64.0.0/10`), Multicast (`224.0.0.0/4`), Broadcast (`255.255.255.255`), Documentation subnets.
   - IPv6 Loopback (`::1`), Unspecified (`::`), Link-Local (`fe80::/10`), Unique Local Addresses (`fc00::/7`), Multicast (`ff00::/8`).
   - IPv4-Mapped IPv6 (`::ffff:0:0/96`) and 6to4 prefix (`2002::/16`) embedding private addresses.
3. **Full DNS Resolution Inspection:**
   - Resolves all `A` and `AAAA` records for target hostnames.
   - If *any* resolved address falls into a forbidden range, the request is immediately rejected.
4. **Anti-DNS Rebinding Mitigation:**
   - Implements custom socket `lookup` pinning that supplies Node's socket connection directly with the pre-resolved, validated public IP.
   - Retains original domain name in TLS SNI (`servername`) and HTTP `Host` header for virtual hosting and TLS certificate verification.
5. **Redirect Destination Validation:**
   - Redirects (`301`, `302`, `303`, `307`, `308`) are followed up to a maximum of 3 hops.
   - Each redirect destination URL and its resolved IPs are re-validated before issuing subsequent requests.
6. **Stream-Level Response Size Enforcement:**
   - Monitored at the chunk stream level with a 2MB default maximum size.
   - If response data exceeds the threshold, the underlying socket is immediately destroyed to prevent memory buffer exhaustion.
7. **Timeout Controls:**
   - Total socket and connection timeout protection (default 10s per HTTP node, max 60s per workflow).

---

## 6. Security Safeguards

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

## 7. Running and Testing

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
Run backend unit and integration test suites:
```bash
# Foundation and Auth tests
npx vitest run src/__tests__/backendApiAndAuth.test.ts

# Server-Side Execution and RBAC tests
npx vitest run src/__tests__/serverWorkflowExecution.test.ts

# SSRF Protection unit tests
npx vitest run src/__tests__/ssrfProtection.test.ts
```

Run all unit, integration, and E2E test suites:
```bash
npm test
npm run test:e2e
```
