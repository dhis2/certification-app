import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
    globalTeardown: './e2e/global-teardown.ts',
    outputDir: 'test-results',
    timeout: 30 * 1000,
    expect: {
        timeout: 5000,
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { outputFolder: 'playwright-report' }], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // Default: production preview so transitive deps resolve like CI builds. Set PLAYWRIGHT_VITE_DEV=1 for `vite` dev.
        command: process.env.PLAYWRIGHT_VITE_DEV === '1' ? 'npm run start' : 'npm run start:e2e',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 240 * 1000,
        env: {
            ...process.env,
            VITE_API_URL: process.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1',
        },
    },
})
