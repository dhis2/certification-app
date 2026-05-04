/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: ['<rootDir>/e2e/'],
    transform: {
        '^.+.tsx?$': ['ts-jest', {}],
    },
}
