module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\.(ts|tsx)$": "ts-jest"
  },
  moduleFileExtensions: ["ts", "tsx", "js", "json", "node"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
};
