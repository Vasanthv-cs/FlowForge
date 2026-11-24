# FlowForge Credential Vault & Secrets Management Guide

The FlowForge Credential Vault enables workspace members to manage sensitive API tokens, authentication headers, and credentials securely. Workflow nodes can reference these credentials by ID without exposing raw secret values in canvas JSON, version snapshots, export files, browser storage, or execution logs.

---

## 1. Supported Credential Types

| Credential Type | Use Case | Secret Parameters | Injected Request Header |
| :--- | :--- | :--- | :--- |
| **API Key** | REST APIs requiring custom header keys (Stripe, OpenAI, SendGrid) | `apiKey`, `headerName` (default: `X-API-Key`) | `<headerName>: <apiKey>` |
| **Bearer Token** | OAuth 2.0 / JWT APIs (GitHub, Slack, Google Cloud, Supabase) | `token` | `Authorization: Bearer <token>` |
| **Basic Auth** | Standard HTTP Basic Authentication | `username`, `password` | `Authorization: Basic <base64(username:password)>` |
| **Custom Headers** | Multi-header security (e.g. AWS signature headers, client ID + secret) | `headers` (Key-Value JSON) | Merged into request headers |

---

## 2. Managing Workspace Credentials

Credentials can be managed through the **Credentials** dialog located in the top navigation bar.

### Creating a Credential
1. Click **Credentials** in the top navigation bar.
2. Click **New Credential** (available to Workspace `owner` and `admin` roles).
3. Specify:
   - **Credential Name**: e.g., `Production Stripe Key`
   - **Description**: Optional notes on usage
   - **Credential Type**: API Key, Bearer Token, Basic Auth, or Custom Headers
   - **Secret Values**: Enter the secret credentials. Inputs are masked by default.
4. Click **Save Credential**. Secrets are immediately encrypted using AES-256-GCM on the backend and stored in PostgreSQL. Raw secret values are cleared from memory.

### Rotating a Credential
1. Open the **Credentials** dialog.
2. Click **Rotate** on the desired credential.
3. Enter new secret values in the rotation field. Leave blank to keep existing secrets while only updating the name or description.
4. Click **Update Credential**. A fresh 96-bit initialization vector (IV) is generated and the secret is re-encrypted.

### Deleting a Credential
1. Click the trash icon next to any credential.
2. Confirm deletion. Any active workflows referencing this credential ID will fail securely with a descriptive error message on their next execution.

---

## 3. Referencing Credentials in Workflow Nodes

### Binding to an HTTP Request Node
1. Add or select an **HTTP Request** node on the canvas.
2. In the right configuration panel, navigate to the **Credential Vault** dropdown.
3. Select any stored credential from your active workspace.
4. The workflow definition saves only the opaque `credentialId` UUID:
   ```json
   {
     "id": "node-1",
     "type": "http-request",
     "data": {
       "config": {
         "method": "POST",
         "url": "https://api.stripe.com/v1/charges",
         "credentialId": "11111111-2222-3333-4444-555555555555"
       }
     }
   }
   ```
5. When the workflow executes on the backend, the durable worker resolves and injects the credential immediately before dispatching the request.

---

## 4. Security & Isolation Controls

### Workspace Boundaries
- Credentials strictly belong to the workspace in which they were created.
- Cross-workspace references are rejected during execution with an error:
  `Cross-workspace credential access rejected: Credential does not belong to workspace.`

### Safe Redaction
- Injected authentication headers (`Authorization`, `X-API-Key`, `Cookie`, etc.) are redacted to `********` before logging.
- Request payloads containing sensitive keys (`password`, `secret`, `token`, `credential`) are deeply sanitized to `[REDACTED]`.

### Cross-Origin Redirect Protection
- If an external HTTP service returns a `301`, `302`, `303`, `307`, or `308` redirect targeting a different origin, FlowForge automatically strips sensitive `Authorization`, `Cookie`, and API key headers to prevent credential leakage.

---

## 5. Role-Based Access Control (RBAC)

| Role | View Metadata | Bind & Execute in Workflows | Create / Rotate / Delete |
| :--- | :---: | :---: | :---: |
| **Owner** | Yes | Yes | Yes |
| **Admin** | Yes | Yes | Yes |
| **Developer** | Yes | Yes | No (403 Forbidden) |
| **Viewer** | Yes | No | No (403 Forbidden) |
