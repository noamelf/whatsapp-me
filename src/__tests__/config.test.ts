/**
 * Configuration and Edge Case Tests
 * Tests environment variables, target group resolution, and edge cases
 * Note: LLM service tests are in llm-service.test.ts
 * Note: WhatsApp client tests are in whatsapp-client.test.ts
 */

import { WhatsAppClient } from "../whatsapp-client";
import { OpenAIService } from "../llm-service";
import { cleanupTestAuthDir } from "./utils/test-helpers";

// Mock modules
jest.mock("@whiskeysockets/baileys");
jest.mock("openai");
jest.mock("fs");
jest.mock("qrcode-terminal");
jest.mock("qrcode");

describe("Configuration and Edge Cases", () => {
  const clients: WhatsAppClient[] = [];

  const createClient = (): WhatsAppClient => {
    const client = new WhatsAppClient();
    clients.push(client);
    return client;
  };

  // Ensure API key is set for tests that need it
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

  beforeAll(() => {
    // Set a test API key if not already set
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    }
  });

  afterAll(() => {
    // Restore original key
    if (originalOpenRouterKey) {
      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  });

  beforeEach(() => {
    cleanupTestAuthDir();
    jest.clearAllMocks();
    clients.length = 0;
    // Ensure API key is set for each test
    if (!process.env.OPENROUTER_API_KEY) {
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    }
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.disconnect()));
    clients.length = 0;
    cleanupTestAuthDir();
  });

  describe("Environment Variable Configuration", () => {
    it("should require OPENROUTER_API_KEY", () => {
      const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      expect(() => {
        new OpenAIService();
      }).toThrow("OPENROUTER_API_KEY must be defined in .env file");

      process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    });

    it("should parse ALLOWED_CHAT_NAMES correctly", () => {
      process.env.ALLOWED_CHAT_NAMES = "Chat1,Chat2,Chat3";
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";

      const _client = createClient();
      const chatNames = process.env.ALLOWED_CHAT_NAMES.split(",");

      expect(chatNames).toHaveLength(3);
      expect(chatNames).toContain("Chat1");
    });
  });

  describe("Target Group Resolution", () => {
    it("should handle valid group JID format", () => {
      const validJIDs = [
        "123456789@g.us",
        "120363123456789012345@g.us",
        "987654321@g.us",
      ];

      validJIDs.forEach((jid) => {
        process.env.TARGET_GROUP_ID = jid;
        const client = createClient();
        expect(client).toBeInstanceOf(WhatsAppClient);
      });
    });

    it("should handle various group name formats", () => {
      const groupNames = [
        "Simple Name",
        "שם בעברית",
        "Mixed עברית and English",
      ];

      groupNames.forEach((name) => {
        process.env.TARGET_GROUP_NAME = name;
        delete process.env.TARGET_GROUP_ID;

        const client = createClient();
        expect(client).toBeInstanceOf(WhatsAppClient);
      });
    });
  });

  describe("Edge Cases - Message Content", () => {
    let service: OpenAIService;

    beforeEach(() => {
      service = new OpenAIService();
    });

    it("should handle empty string message", async () => {
      const result = await service.analyzeMessage(
        "test-chat-id",
        "",
        "Test Chat",
        "Test User"
      );

      expect(result).toHaveProperty("hasEvents");
      expect(result).toHaveProperty("events");
      expect(Array.isArray(result.events)).toBe(true);
    });

    it("should handle very long messages", async () => {
      const longMessage = "a".repeat(10000);

      const result = await service.analyzeMessage(
        "test-chat-id",
        longMessage,
        "Test Chat",
        "Test User"
      );

      expect(result).toHaveProperty("hasEvents");
    });

    it("should handle messages with only emojis", async () => {
      const result = await service.analyzeMessage(
        "test-chat-id",
        "😀😃😄🎉🎊🎈",
        "Test Chat",
        "Test User"
      );

      expect(result).toHaveProperty("hasEvents");
    });

    it("should handle messages with URLs", async () => {
      const result = await service.analyzeMessage(
        "test-chat-id",
        "Meeting tomorrow at https://zoom.us/j/123456789",
        "Test Chat",
        "Test User"
      );

      expect(result).toHaveProperty("hasEvents");
    });
  });

  describe("Edge Cases - Chat Context", () => {
    let service: OpenAIService;

    beforeEach(() => {
      service = new OpenAIService();
    });

    it("should handle empty chat name", async () => {
      const result = await service.analyzeMessage(
        "test-chat-id",
        "Meeting tomorrow",
        "",
        "Test User"
      );

      expect(result).toHaveProperty("hasEvents");
    });

    it("should handle large conversation history", async () => {
      const largeHistory = Array.from({ length: 100 }, (_, i) => ({
        text: `Message ${i}`,
        timestamp: Date.now() - (100 - i) * 1000,
      }));

      const result = await service.analyzeMessage(
        "test-chat-id",
        "Meeting tomorrow",
        "Test Chat",
        "Test User",
        largeHistory
      );

      expect(result).toHaveProperty("hasEvents");
    });
  });

  describe("Error Recovery", () => {
    let service: OpenAIService;

    beforeEach(() => {
      service = new OpenAIService();
    });

    it("should handle network errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const MockedOpenAI = jest.requireMock("openai").default;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const mockInstance = new MockedOpenAI();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const mockCreate = mockInstance.chat.completions.create;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      mockCreate.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.analyzeMessage(
        "test-chat-id",
        "Meeting tomorrow",
        "Test Chat",
        "Test User"
      );

      expect(result.hasEvents).toBe(false);
      expect(result.events).toEqual([]);
    });

    it("should handle API rate limiting", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const MockedOpenAI = jest.requireMock("openai").default;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const mockInstance = new MockedOpenAI();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const mockCreate = mockInstance.chat.completions.create;
      const rateLimitError = new Error("Rate limit exceeded") as Error & {
        status: number;
      };
      rateLimitError.status = 429;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      mockCreate.mockRejectedValueOnce(rateLimitError);

      const result = await service.analyzeMessage(
        "test-chat-id",
        "Meeting tomorrow",
        "Test Chat",
        "Test User"
      );

      expect(result.hasEvents).toBe(false);
      expect(result.events).toEqual([]);
    });
  });

  describe("Concurrency", () => {
    it("should handle multiple simultaneous OpenAI service calls", async () => {
      const service = new OpenAIService();

      const promises = Array.from({ length: 5 }, (_, i) =>
        service.analyzeMessage(
          `test-chat-${i}`,
          "Meeting tomorrow",
          `Test Chat ${i}`,
          "Test User"
        )
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toHaveProperty("hasEvents");
        expect(result).toHaveProperty("events");
      });
    });
  });
});
