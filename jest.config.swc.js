module.exports = {
  testEnvironment: "node",
  
  // Performance optimizations
  maxWorkers: "50%", // Use half the available CPU cores
  
  // Use SWC for ultra-fast TypeScript compilation
  transform: {
    "^.+\\.(ts|tsx)$": "@swc/jest",
  },
  
  moduleFileExtensions: ["ts", "tsx", "js", "json", "node"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
  
  // Caching optimizations
  cache: true,
  cacheDirectory: "<rootDir>/.jest-cache",
  
  // Coverage optimization (only if coverage is needed)
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/**/*.test.{ts,tsx}",
  ],
  
  // Speed up module resolution
  modulePathIgnorePatterns: ["<rootDir>/dist/", "<rootDir>/node_modules/"],
  
  // Skip unnecessary transformations
  transformIgnorePatterns: [
    "node_modules/(?!(.*\\.mjs$))"
  ],
  
  // Faster test detection
  testMatch: [
    "<rootDir>/test/**/*.test.{ts,tsx}",
    "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
    "<rootDir>/src/**/*.test.{ts,tsx}"
  ],
};