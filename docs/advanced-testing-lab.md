# FlowForge Workflow Testing Laboratory (Batch 13)

The **Workflow Testing Laboratory** is an automated regression testing and validation suite built directly into FlowForge. It enables developers and workflow creators to test workflows against different input conditions, stub external dependencies via deterministic mocking, validate execution outputs, and run entire test suites before deploying workflows to production.

---

## 1. Core Architecture & Principles

1. **Execution Parity:** The Test Lab runs through the authoritative `@flowforge/workflow-core` DAG engine (`WorkflowEngine`). It uses identical execution semantics, node executors, and DAG scheduling as production runs.
2. **Deterministic Mocking:** When testing workflows with outbound HTTP requests, users can configure mock status codes, response headers, and bodies per scenario. Mocks run safely in process memory and never make real network calls to third-party endpoints.
3. **Strict Type Preservation:** 
   - `false` (boolean) is never treated as missing, empty, or undefined.
   - Numbers (`42`) and numeric strings (`"42"`) remain distinct types unless explicit conversion is chosen.
   - Deep equality matching is supported for nested JSON objects and arrays.
4. **Pre-Execution Validation:** Prior to dispatching a test, workflows are checked for missing triggers, disconnected nodes, circular loops, and missing node configuration settings with actionable fix suggestions.

---

## 2. Assertion Operators Reference

The assertion builder supports 15 operators:

| Operator | Syntax | Description | Supported Types |
| :--- | :--- | :--- | :--- |
| **Equals** | `== Equals` | Checks strict equivalence with optional type enforcement (`String`, `Number`, `Boolean`, `JSON`). | Any |
| **Not Equals** | `!= Not Equal` | Negation of equals. | Any |
| **Contains** | `Contains` | Checks for substring presence in text, or element presence in arrays. | String, Array |
| **Does Not Contain** | `Does Not Contain` | Negation of contains. | String, Array |
| **Exists** | `Exists` | Verifies property is not `null` and not `undefined`. Note: `false`, `0`, and `""` pass! | Any |
| **Does Not Exist** | `Does Not Exist` | Verifies property is `null` or `undefined`. | Any |
| **Is True** | `Is True (Boolean)` | Strictly checks `actual === true`. | Boolean |
| **Is False** | `Is False (Boolean)` | Strictly checks `actual === false`. | Boolean |
| **Greater Than** | `> Greater Than` | Strict numeric comparison (`actual > expected`). | Number |
| **Less Than** | `< Less Than` | Strict numeric comparison (`actual < expected`). | Number |
| **Greater or Equal** | `>= Greater or Equal` | Numeric comparison (`actual >= expected`). | Number |
| **Less or Equal** | `<= Less or Equal` | Numeric comparison (`actual <= expected`). | Number |
| **Length Equals** | `Length Equals` | Checks array length or string character count. | Array, String, Object |
| **Length Greater Than**| `Length Greater Than` | Verifies array length or string length exceeds target. | Array, String |
| **Length Less Than** | `Length Less Than` | Verifies array length or string length is under target. | Array, String |

---

## 3. Beginner-Friendly Guide: How to Use the Testing Lab

### Step 1: Open the Test Lab
1. In the FlowForge top navigation bar, click the **Test Lab** button (`FlaskConical` icon).
2. The Test Lab modal appears, displaying your scenarios on the left panel and scenario configuration on the right.

### Step 2: Create or Customize a Scenario
1. Click **+ New** in the left sidebar to create a scenario, or click the **Duplicate** icon next to an existing scenario to copy it.
2. Edit the **Scenario Name** and **Description** so your team understands what this test verifies.
3. In the **Sample Trigger Input (JSON)** box, enter the simulated payload.
   *Example:*
   ```json
   {
     "userId": "usr_999",
     "tier": "enterprise",
     "score": 95
   }
   ```
   *Note:* The editor provides live syntax feedback if your JSON is invalid.

### Step 3: Configure Deterministic HTTP Mocks (Optional)
If your workflow includes `HTTP Request` nodes:
1. Expand the **Deterministic Test Mode: HTTP Mocking** section.
2. Check **Mock "[Node Label]"**.
3. Specify the simulated **Status Code** (e.g. `200` or `404`) and **Mocked Response Body** (e.g. `{"active": true}`).
4. When executed, FlowForge intercepts the request and injects your mock response without sending an external request.

### Step 4: Add Assertions
1. Click **+ Add Assertion**.
2. Select your **Target Node** from the dropdown. 
   - All workflow nodes are listed clearly with their labels and types (e.g. `Check Tier (condition)`).
   - If an assertion refers to a missing or deleted node, a warning badge is displayed indicating that the node needs to be re-selected.
3. Enter the **Property Path** you want to inspect:
   - For Condition nodes: `_condition.branch` (returns `"true"` or `"false"`), or `_condition.passed` (returns `true` or `false`).
   - For HTTP Request nodes: `status`, `data.items`, or `ok`.
   - For Data nodes: `result`, `mapped`, `filtered`, or `summary`.
4. Choose an **Operator** (e.g., `== Equals`, `Is True`, or `> Greater Than`).
5. Choose an **Expected Value Type** (optional: `String`, `Number`, `Boolean`, `JSON`) and enter the **Expected Value**.

### Step 5: Run Tests
- **Run a Single Scenario:** Click the green **Run Scenario** button in the top right.
- **Run the Entire Suite:** Click **Run Entire Suite** to execute all scenarios sequentially.
- Once complete, click **Suite Summary** in the top tabs to see:
  - Total scenarios run.
  - Number of scenarios passed and failed.
  - Total runtime in milliseconds.
  - Individual scenario breakdown.

---

## 4. Manual Verification Checklist

Use this checklist to manually test all capabilities:

| # | Test Scenario / Action | Expected Result | Verified |
| :- | :--- | :--- | :--- |
| **1** | Open Test Lab on a workflow with nodes | Target node dropdown displays all nodes with label and type; no blank dropdown. | [x] |
| **2** | Add an assertion targeting `_condition.branch` with `== Equals` and `false` | Assertion passes when branch is false, and fails with a clear message when true. | [x] |
| **3** | Add an assertion with `Is False (Boolean)` targeting a boolean `false` property | Assertion passes strictly on boolean `false` and fails on string `"false"`. | [x] |
| **4** | Add an assertion with `expectedType: number` and compare number `200` with string `"200"` | Fails cleanly with a type mismatch error rather than silently converting. | [x] |
| **5** | Enable HTTP Mock on an HTTP Request node and run scenario | Execution completes with `MOCKED SERVICES` badge; no live fetch made. | [x] |
| **6** | Duplicate an existing scenario via the Duplicate icon | Exact copy created with `(Copy)` suffix and identical payload/assertions. | [x] |
| **7** | Click "Run Entire Suite" with multiple scenarios | All scenarios run sequentially; progress is displayed; Suite Summary table populates. | [x] |
| **8** | Delete an obsolete scenario | Scenario removed from list and database; next scenario is selected. | [x] |
| **9** | Disconnect a node and inspect Pre-Test Validation | Alert banner appears identifying the disconnected node with actionable fix. | [x] |
