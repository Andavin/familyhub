import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command:
			'pnpm run build && DATABASE_URL=./data/test.db pnpm run db:reset && DATABASE_URL=./data/test.db FAMILY_PASSWORD=letmein pnpm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
