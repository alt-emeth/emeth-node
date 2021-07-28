module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'ethereum',
  testEnvironmentOptions: {
    injectWeb3Provider: true
  },
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/src/eth-lib/']
}
