import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test'
import { TEST_USERS } from '../fixtures/test-fixtures.ts'

export const apiBaseUrl = (): string => {
    return process.env.VITE_API_URL ?? 'http://127.0.0.1:8080/api/v1'
}

/** Creates a browser context with admin JWT in localStorage, or `null` if login fails. */
export const tryCreateAdminContext = async (browser: Browser, request: APIRequestContext): Promise<BrowserContext | null> => {
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
    let res
    try {
        res = await request.post(`${apiBaseUrl()}/auth/login`, {
            data: { email: TEST_USERS.admin.email, password: TEST_USERS.admin.password },
            failOnStatusCode: false,
        })
    } catch {
        return null
    }
    if (!res.ok()) {
        return null
    }
    const tokens = await res.json()
    const storageState = {
        cookies: [],
        origins: [
            {
                origin,
                localStorage: [{ name: 'dhis2_cert_tokens', value: JSON.stringify(tokens) }],
            },
        ],
    }
    return browser.newContext({ storageState, baseURL: origin })
}
