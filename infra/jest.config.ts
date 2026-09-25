import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  // bin/app.ts is a CDK entry-point script (instantiates stacks against real
  // env), mirroring how backend's jest.config.ts excludes main.ts/lambda.ts —
  // it has no branching logic and is exercised end-to-end by `cdk synth`.
  collectCoverageFrom: ['lib/**/*.ts'],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
