# FlowForge Built-in Nodes & Integrations Reference (Batch 12)

This document provides a comprehensive operational reference for the built-in node catalog in FlowForge.

## Architectural Principles

1. **Deterministic & Strongly-Typed:** All node schemas are strictly defined using Zod inside `@flowforge/workflow-schema` and validated prior to execution.
2. **Strict Code Execution Isolation:** FlowForge does not use `eval()`, `new Function()`, or un-sandboxed Node.js `vm`. All transformations, data projections, string manipulations, and arithmetic calculations are declarative and sandboxed.
3. **Execution Parity:** Node executors conform to the `@flowforge/node-sdk` interface (`NodeExecutor`) and operate identically across client-side test execution and backend durable worker jobs.
4. **Resilience & Bound Safety:** Built-in safeguards enforce defensive limits against memory exhaustion and infinite loops (e.g., maximum array processing lengths, timeout boundaries, and literal-based string replacement to prevent ReDoS).

---

## Node Catalog Summary

| Category | Node Type | Purpose | Inputs | Outputs |
| :--- | :--- | :--- | :--- | :--- |
| **Trigger** | `manual-trigger` | Manually initiate execution with custom JSON payload | None | Output payload (`any`) |
| **Trigger** | `webhook-trigger` | HTTP endpoint trigger with secret/HMAC auth | None | Incoming request data |
| **Trigger** | `schedule-trigger`| Recurring execution using cron expressions | None | Trigger metadata |
| **Trigger** | `webhook-response` | Formats HTTP response for synchronous webhooks | Payload (`any`) | Response metadata |
| **Data** | `http-request` | Outbound REST calls with SSRF protection, query params & vault auth | Trigger (`any`) | Response payload |
| **Data** | `transform-data` | Safe property extraction & scalar conversions | In data (`any`) | Result (`any`) |
| **Data** | `json-parse` | Parse JSON text into structured object | Input (`any`) | Parsed object |
| **Data** | `json-stringify` | Serialize data structure to JSON string | Input (`any`) | Formatted string |
| **Data** | `set-data` | Assign typed key-values into payload | Input (`any`) | Enriched payload |
| **Data** | `merge-data` | Deep/shallow merge with collision resolution | Input (`object`) | Merged object |
| **Data** | `filter-data` | Array filtering with relational operators | Array (`array`) | Filtered array |
| **Data** | `map-data` | Array projection and field renaming | Array (`array`) | Mapped array |
| **Logic** | `condition` | Boolean branching with comparison operators | Input (`any`) | `true` or `false` branch |
| **Utility**| `string-operations` | Trim, case change, replace, split, and join | Input (`any`) | Result string/array |
| **Utility**| `date-time` | Current timestamps, ISO format, and date arithmetic | Input (`any`) | Formatted timestamp |
| **Utility**| `math-operations` | Arithmetic (+, -, *, /), round, min, and max | Input (`any`) | Numeric result |
| **Utility**| `delay` | Pause execution for a specified duration | Input (`any`) | Passthrough |
| **Utility**| `console-output` | Output logging to execution history | Input (`any`) | Passthrough |

---

## Detailed Node Specifications

### 1. JSON Parse (`json-parse`)
- **Purpose:** Safely deserializes raw JSON text into structured JavaScript objects.
- **Configuration:**
  - `inputPath` (string, optional): Dot/bracket notation path to target string in payload. If empty, the root payload is parsed.
  - `outputKey` (string, default: `"parsed"`): Key name where the resulting object is stored.
- **Behavior & Edge Cases:**
  - If target value is already an object, it is preserved without error.
  - Throws an informative error if the input string is empty or contains malformed JSON syntax.
  - Rejects non-string and non-object inputs with clear diagnostic messages.

### 2. JSON Stringify (`json-stringify`)
- **Purpose:** Serializes JavaScript objects into formatted JSON text strings.
- **Configuration:**
  - `inputPath` (string, optional): Path to object in incoming data.
  - `prettyPrint` (boolean, default: `false`): Enables multi-line indentation.
  - `indentSpaces` (number, min: 0, max: 8, default: `2`): Number of indentation spaces.
  - `outputKey` (string, default: `"jsonString"`): Output property key.
- **Behavior:** Safely handles circular references and serializes nested objects.

### 3. Set Data (`set-data`)
- **Purpose:** Appends or mutates explicit typed fields on the workflow payload.
- **Configuration:**
  - `fields` (array): List of `{ key: string, value: string, valueType: 'string' | 'number' | 'boolean' | 'json' }`.
  - `mergeWithIncoming` (boolean, default: `true`): If `true`, new fields are merged onto incoming payload. If `false`, only the configured fields are output.
- **Behavior:**
  - Automatically parses numbers (`parseFloat`), booleans (`'true' === true`), and valid JSON literals.
  - Fails cleanly if a JSON value fails serialization.

### 4. Merge Data (`merge-data`)
- **Purpose:** Blends the incoming primary data object with secondary configured JSON data.
- **Configuration:**
  - `strategy` (`'shallow' | 'deep'`, default: `'deep'`):
    - `shallow`: Merges top-level keys only (`Object.assign`).
    - `deep`: Recursively blends child objects while preserving nested properties.
  - `conflictResolution` (`'overwrite' | 'keep_original' | 'error'`, default: `'overwrite'`):
    - `overwrite`: Secondary properties override primary properties.
    - `keep_original`: Primary properties take precedence on collision.
    - `error`: Throws an execution exception if conflicting keys exist.
  - `secondaryData` (string, default: `"{}"`): JSON string of data to merge.

### 5. Filter Data (`filter-data`)
- **Purpose:** Filters elements of an array according to a relational operator.
- **Configuration:**
  - `arrayPath` (string, optional): Path to array in payload. If empty, root payload is expected to be an array.
  - `itemField` (string, optional): Property path within each item to test (leave blank for primitive arrays).
  - `operator`: `'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal' | 'contains' | 'starts_with' | 'is_empty' | 'is_not_empty'`.
  - `targetValue` (string): Comparison benchmark.
  - `outputKey` (string, default: `"filtered"`): Destination key in output.
- **Safety Limits:**
  - Enforces a maximum array limit (`MAX_ARRAY_ITEMS = 50,000`) to prevent memory exhaustion.
  - Gracefully handles non-array targets with a descriptive failure.

### 6. Map Data (`map-data`)
- **Purpose:** Projects and renames specific fields across array elements.
- **Configuration:**
  - `arrayPath` (string, optional): Target array path.
  - `mappings` (array): List of `{ sourceField: string, targetField: string }`.
  - `outputKey` (string, default: `"mapped"`): Destination output key.
- **Behavior:**
  - Extracts nested properties from source fields using dot notation.
  - Produces lean arrays containing only mapped properties.

### 7. String Operations (`string-operations`)
- **Purpose:** Declarative string manipulation without regular expression injection vulnerabilities.
- **Configuration:**
  - `operation`: `'trim' | 'uppercase' | 'lowercase' | 'replace' | 'split' | 'join'`.
  - `inputPath` (string, optional): Path to input string or array.
  - `findText` (string, optional): Target substring for replace.
  - `replaceWith` (string, optional): Replacement string.
  - `separator` (string, optional, default: `","`): Separator for `split` and `join`.
  - `outputKey` (string, default: `"result"`): Output property key.
- **Security:**
  - The `replace` operation uses literal string splitting and joining (`source.split(findText).join(replaceWith)`) instead of dynamic `RegExp` to eliminate Regular Expression Denial of Service (ReDoS) risks.

### 8. Date and Time (`date-time`)
- **Purpose:** Generates timestamps, formats dates, and calculates date offsets.
- **Configuration:**
  - `operation`: `'current_timestamp' | 'format' | 'add' | 'subtract'`.
  - `inputDate` (string, optional): ISO string, epoch milliseconds, or payload property path.
  - `outputFormat`: `'iso' | 'utc_string' | 'timestamp_ms' | 'date_only' | 'time_only'`.
  - `amount` (number, default: `0`): Duration delta.
  - `unit`: `'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days'`.
  - `outputKey` (string, default: `"timestamp"`): Output key name.
- **Behavior:** Validates inputs using standard JavaScript `Date` and rejects invalid date strings.

### 9. Math Operations (`math-operations`)
- **Purpose:** Performs deterministic arithmetic calculations without `eval`.
- **Configuration:**
  - `operation`: `'add' | 'subtract' | 'multiply' | 'divide' | 'round' | 'min' | 'max'`.
  - `leftOperand` (string): Numeric literal or payload path.
  - `rightOperand` (string, optional): Numeric literal or payload path.
  - `precision` (number, 0 to 10, default: `0`): Decimal rounding places for `'round'`.
  - `outputKey` (string, default: `"result"`): Output key.
- **Defensive Safeguards:**
  - Explicitly detects division by zero (`right === 0` in `'divide'`) and aborts with a descriptive execution error (`"Division by zero is undefined."`).

### 10. Webhook Response (`webhook-response`)
- **Purpose:** Provides custom HTTP status codes, headers, and responses for synchronous webhook callers.
- **Configuration:**
  - `statusCode` (number, 100 to 599, default: `200`): HTTP status code.
  - `headers` (record of strings): Custom HTTP response headers.
  - `body` (string, JSON or text): Custom payload returned to webhook invoker.
- **Integration:** Automatically parsed by the server route `/api/webhooks/:path` when the triggering webhook is set to `respondMode: 'sync'`.

### 11. HTTP Request Enhancements (`http-request`)
- **Added Capabilities:**
  - `queryParams` (key-value record): Appends URL search parameters safely using `URL.searchParams.set()`.
  - Credential Vault integration: Secret injection resolved securely at execution time.
  - SSRF-protection: Blocks private IPv4/IPv6 ranges and AWS/GCP cloud metadata addresses (`169.254.169.254`).

---

## Example Chained Pipeline

The following workflow demonstrates data parsing, filtering, field projection, and calculation:

```
[ Webhook Trigger (Sync) ]
            │ (Incoming JSON string)
            ▼
     [ JSON Parse ]
            │ (Parsed item array)
            ▼
    [ Filter Data ] (stock >= 10)
            │ (High-stock items)
            ▼
      [ Map Data ]  (project { id -> sku, stock -> qty })
            │ (Cleaned array)
            ▼
   [ Math Operations ] (sum items)
            │ (Calculated totals)
            ▼
[ Webhook Response ] (200 OK + summary payload)
```
