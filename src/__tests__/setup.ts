/**
 * Jest setup file - runs before all tests
 */

// Set test environment variables
// Support both OpenRouter and OpenAI keys for testing
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-api-key";
process.env.LLM_MODEL = process.env.LLM_MODEL || "gpt-5-mini";
process.env.TARGET_GROUP_NAME = "Test Group";
process.env.BAILEYS_AUTH_DIR = ".baileys_auth_test";
process.env.NODE_ENV = "test";

// Increase timeout for tests that may need it
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
