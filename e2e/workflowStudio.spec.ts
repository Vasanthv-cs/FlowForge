import { test, expect } from '@playwright/test';

test.describe('FlowForge Visual Workflow Programming Studio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app root and canvas to mount
    await expect(page.locator('#root')).toBeVisible();
  });

  test('loads application shell with dark theme, branding, and palettes', async ({ page }) => {
    // 1. Verify page title
    await expect(page).toHaveTitle(/FlowForge/);

    // 2. Verify branding
    await expect(page.getByText('FlowForge', { exact: true })).toBeVisible();

    // 3. Verify top navigation controls
    await expect(page.getByRole('button', { name: /Validate/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Run/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Test Lab/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Versions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Export/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import/i })).toBeVisible();

    // 4. Verify left node library
    await expect(page.getByText('Nodes', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Search nodes...')).toBeVisible();

    // 5. Verify initial canvas empty state
    await expect(page.getByText('Build Your Workflow')).toBeVisible();
  });

  test('loads onboarding demo pipeline and validates workflow graph', async ({ page }) => {
    // Open Workflows dropdown
    await page.getByRole('button', { name: /Workflows/i }).click();

    // Click Load Onboarding Demo Pipeline
    await page.getByRole('button', { name: /Load Onboarding Demo Pipeline/i }).click();

    // Verify nodes appear on canvas
    await expect(page.getByText('Fetch GitHub Zen')).toBeVisible();
    await expect(page.getByText('Check User Status')).toBeVisible();
    await expect(page.getByText('Wait 1 Second')).toBeVisible();

    // Click Validate button
    await page.getByRole('button', { name: /Validate/i }).click();

    // Bottom panel should show validation results
    await expect(page.getByText(/Validation Issues|Execution Logs/i).first()).toBeVisible();
  });

  test('executes demo pipeline, animates progress, and displays debugger logs', async ({ page }) => {
    // Load onboarding demo pipeline
    await page.getByRole('button', { name: /Workflows/i }).click();
    await page.getByRole('button', { name: /Load Onboarding Demo Pipeline/i }).click();

    // Click Run button
    const runBtn = page.getByRole('button', { name: /^Run$/i });
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Wait for execution to finish (status badges appear)
    await expect(page.getByText(/SUCCESS|RUNNING/i).first()).toBeVisible({ timeout: 15000 });

    // Open Timeline tab in bottom panel
    await page.getByRole('button', { name: /Timeline/i }).click();
    await expect(page.getByText(/Workflow Execution/i).or(page.getByText(/ms/i)).first()).toBeVisible();

    // Open Past Runs tab
    await page.getByRole('button', { name: /Past Runs/i }).click();
  });

  test('inspects node execution debugger and displays input/output JSON', async ({ page }) => {
    // Load onboarding demo pipeline
    await page.getByRole('button', { name: /Workflows/i }).click();
    await page.getByRole('button', { name: /Load Onboarding Demo Pipeline/i }).click();

    // Run workflow
    await page.getByRole('button', { name: /^Run$/i }).click();
    await page.waitForTimeout(2000);

    // Click on the Manual Trigger node on canvas
    await page.getByText('Manual Trigger').first().click();

    // Switch to Execution Debugger tab in Right Sidebar Inspector
    const debugTab = page.getByRole('button', { name: /Execution Debugger/i });
    await expect(debugTab).toBeVisible();
    await debugTab.click();

    // Verify Input JSON and Output JSON sections are rendered
    await expect(page.getByText(/Incoming Payload|Input JSON/i).first()).toBeVisible();
    await expect(page.getByText(/Result Output|Output JSON/i).first()).toBeVisible();
  });

  test('opens and interacts with Testing Laboratory modal', async ({ page }) => {
    // Click Test Lab button
    await page.getByRole('button', { name: /Test Lab/i }).click();

    // Verify modal header & default seeded scenario
    await expect(page.getByText('Workflow Testing Laboratory')).toBeVisible();
    await expect(page.getByText(/Standard Active User Scenario|Scenarios/i).first()).toBeVisible();

    // Close modal
    await page.locator('button:has(svg.lucide-x)').first().click();
  });

  test('opens and interacts with Version History modal', async ({ page }) => {
    // Click Versions button
    await page.getByRole('button', { name: /Versions/i }).click();

    // Verify modal header
    await expect(page.getByText('Workflow Version History')).toBeVisible();
    await expect(page.getByPlaceholder('Tag (e.g. v1.1)')).toBeVisible();

    // Close modal
    await page.locator('button:has(svg.lucide-x)').first().click();
  });
});
