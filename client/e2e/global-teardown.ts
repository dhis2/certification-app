import { FullConfig } from '@playwright/test'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const globalTeardown = async (_config: FullConfig): Promise<void> => {
    console.log('Running global teardown...')
    console.log('Global teardown completed')
}

export default globalTeardown
