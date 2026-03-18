import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@auth/(.*)$': '<rootDir>/auth/$1',
    '^@wallet/(.*)$': '<rootDir>/wallet/$1',
    '^@fx/(.*)$': '<rootDir>/fx/$1',
    '^@transactions/(.*)$': '<rootDir>/transactions/$1',
    '^@users/(.*)$': '<rootDir>/users/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@redis/(.*)$': '<rootDir>/redis/$1',
    '^@mail/(.*)$': '<rootDir>/mail/$1',
    '^@admin/(.*)$': '<rootDir>/admin/$1',
  },
};

export default config;