import type { Config } from 'jest';

const config: Config = {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/src/__tests__'],
  collectCoverageFrom: ['src/**/*.ts', '!src/db/migrate.ts', '!src/db/seed.ts'],
};

export default config;
