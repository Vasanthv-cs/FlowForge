# FlowForge Credential Vault & Secure Secrets — Security Design

This document details the architecture, threat model, cryptographic mechanisms, access controls, and operational guidelines for the FlowForge Credential Vault.

---

## 1. Overview & Goals

FlowForge workflows often interact with external third-party APIs, webhooks, databases, and microservices requiring authentication (e.g., API keys, Bearer tokens, HTTP Basic authentication, custom signature headers).

The primary objectives of the Credential Vault are:
1. **Confidentiality**: Protect raw secrets at rest, in transit, and in memory. Raw secrets are never stored in plaintext within database tables, workflow definitions, logs, or client-side storage.
2. **Workspace Isolation**: Enforce strict multi-tenant boundaries. Workflows running in Workspace A cannot access or resolve credentials registered to Workspace B.
3. **Least Privilege & Role-Based Access Control (RBAC)**: Only Workspace `owner` and `admin` members can create, rotate, update, or delete credentials. `developer` members can bind permitted credentials to workflow nodes and execute them. `viewer` members can inspect metadata only.
4. **Zero Client-Side Secret Leakage**: The frontend receives only safe, high-level metadata (ID, name, description, credential type, timestamps). Encrypted ciphertext, initialization vectors, authentication tags, and plaintext secrets are strictly kept on the server.
5. **Safe Server-Side Resolution**: Secrets are decrypted in backend memory immediately prior to outbound HTTP requests and are never written to execution history, event timelines, or persistent node logs.
6. **Redirect Protection**: Outbound HTTP requests that are redirected across origins automatically strip authorization credentials to prevent accidental credential forwarding to third-party endpoints.

---

## 2. Threat Model & Mitigations

| Threat | Description | FlowForge Vault Mitigation |
| :--- | :--- | :--- |
| **Database Compromise (Dump/Leak)** | An attacker obtains a read replica or raw database dump of PostgreSQL tables. | All secret values are encrypted at rest using **AES-256-GCM** with a server-side encryption key. The database contains only base64/hex ciphertext, random 96-bit initialization vectors, and 128-bit authentication tags. |
| **Cross-Workspace Privilege Escalation** | A tenant in Workspace A attempts to guess or reference a credential ID belonging to Workspace B. | Both the REST API and the workflow execution engine enforce strict workspace tenancy checks in database queries and application logic. Mismatched workspace references result in rejection. |
| **Frontend State & Browser Leakage** | Secrets stored in browser local storage, IndexedDB, or React component state leak via XSS or browser history. | Frontend clients **never** receive plaintext secrets or cipher blobs. Secret inputs in the UI are write-only / rotate-only. Workflow definitions only store opaque UUIDs (`credentialId`). |
| **Logging & Telemetry Exposure** | Sensitive tokens appear in application stdout logs, node execution records, or error traces. | Deep recursive data redaction (`redactSensitiveData`) and header sanitization (`sanitizeHeadersForLogging`) mask tokens (`********` / `[REDACTED]`) before persistence and console output. |
| **Outbound SSRF & Credential Exfiltration via Redirects** | A target server returns an HTTP 302 redirecting to an attacker-controlled origin to capture the `Authorization` header. | `safeHttpClient` validates redirect targets against private IP / SSRF rules and strips sensitive headers (`Authorization`, `Cookie`, custom API headers) when a cross-origin redirect occurs. |
| **Ciphertext Tampering / Bit-Flipping** | An attacker modifies ciphertext in PostgreSQL to alter decrypted contents. | Authenticated encryption (AES-256-GCM) verifies the 128-bit authentication tag before returning plaintext. Any alteration immediately causes decryption failure. |

---

## 3. Cryptographic Design

### 3.1 Encryption Algorithm
- **Algorithm**: `aes-256-gcm` (Galois/Counter Mode) via standard Node.js `node:crypto`.
- **Key Length**: 256 bits (32 bytes).
- **Initialization Vector (IV / Nonce)**: Cryptographically secure random 96 bits (12 bytes) generated via `crypto.randomBytes(12)` per encryption operation. Nonces are **never reused**.
- **Authentication Tag**: 128 bits (16 bytes) produced by AES-GCM and verified on decryption via `decipher.setAuthTag()`.
- **Key Identifier**: A `key_version` tag (e.g., `'v1'`) is stored with every credential record to support seamless future key rotation.

### 3.2 Key Management
- The master encryption key is supplied exclusively through the server environment variable `FLOWFORGE_ENCRYPTION_KEY`.
- The key must be a 64-character hexadecimal string or 32 raw bytes (256 bits).
- **Prohibitions**:
  - The key must **never** be prefixed with `VITE_` (which Vite bundles to the browser client).
  - The key is **never** committed to version control.
  - The server **fails securely on startup** if `FLOWFORGE_ENCRYPTION_KEY` is absent or malformed in production.

---

## 4. Credential Types & In-Flight Payload Schemas

FlowForge supports four primary credential types:

1. **`api_key`**:
   - Stored Payload: `{ "apiKey": "...", "headerName": "X-API-Key" }`
   - Injected Header: Configured header (defaults to `X-API-Key`) with the secret value.
2. **`bearer_token`**:
   - Stored Payload: `{ "token": "..." }`
   - Injected Header: `Authorization: Bearer <token>`
3. **`basic_auth`**:
   - Stored Payload: `{ "username": "...", "password": "..." }`
   - Injected Header: `Authorization: Basic <base64(username:password)>`
4. **`custom_headers`**:
   - Stored Payload: `{ "headers": { "X-Custom-Secret": "...", "X-Client-ID": "..." } }`
   - Injected Headers: Merged directly into outbound request headers.

---

## 5. Storage Schema & Row-Level Security

PostgreSQL table `public.credentials`:

```sql
CREATE TABLE public.credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    credential_type TEXT NOT NULL CHECK (credential_type IN ('api_key', 'bearer_token', 'basic_auth', 'custom_headers')),
    encrypted_data TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version TEXT NOT NULL DEFAULT 'v1',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### Row-Level Security (RLS)
- **Read**: Authenticated workspace members (`owner`, `admin`, `developer`, `viewer`) can query rows belonging to their active workspace. (Note: Encrypted columns are never surfaced via the API).
- **Write**: Only `owner` and `admin` roles can insert, update, or delete credential rows.

---

## 6. Access Control & Execution Lifecycle

```
[ User (Developer/Admin) ]
            │
            ▼
[ Canvas: Selects Credential by Name/Type ]
            │
            │ Workflow Definition: Stores only { credentialId: "uuid" }
            ▼
[ Workflow Execution (Fastify Server / Durable Worker) ]
            │
            ├── 1. Validates workflow's workspaceId matches execution context
            ├── 2. Queries public.credentials WHERE id = credentialId AND workspace_id = executionWorkspaceId
            ├── 3. If missing or workspace mismatch -> Execution fails with safe error
            ├── 4. Decrypts secret in memory via AES-256-GCM
            ├── 5. Injects authentication headers into safeHttpRequest options
            ├── 6. Executes outbound request with SSRF & redirect origin guards
            └── 7. Strips raw headers from execution output & event logs
```

---

## 7. Key Rotation & Recovery Procedures

### Key Versioning
Each credential records the `key_version` with which it was encrypted.

### Manual Key Rotation Procedure
1. Provision a new 256-bit key (`FLOWFORGE_ENCRYPTION_KEY_V2`) in the secrets manager.
2. Maintain backward-compatible decryption using `key_version = 'v1'` key.
3. Run an administrative offline migration script:
   - For each credential in `public.credentials`:
     - Decrypt with `FLOWFORGE_ENCRYPTION_KEY_V1`.
     - Re-encrypt with `FLOWFORGE_ENCRYPTION_KEY_V2` and generate fresh IV.
     - Update `encrypted_data`, `iv`, `auth_tag`, and set `key_version = 'v2'`.
4. Decommission `FLOWFORGE_ENCRYPTION_KEY_V1`.
