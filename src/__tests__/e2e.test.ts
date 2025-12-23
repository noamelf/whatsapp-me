/**
 * End-to-End Integration Tests
 * Tests the complete pipeline from WhatsApp message -> LLM -> Event extraction
 * Note: Detailed LLM service tests are in llm-service.test.ts
 */

import { OpenAIService } from "../llm-service";
import {
  createMockWAMessage,
  validateMultiEventResult,
  loadFixtures,
} from "./utils/test-helpers";

// Mock modules
jest.mock("@whiskeysockets/baileys");
jest.mock("openai");
jest.mock("fs");
jest.mock("qrcode-terminal");
jest.mock("qrcode");

describe("End-to-End Integration Tests", () => {
  let openaiService: OpenAIService;
  const fixtures = loadFixtures();

  beforeEach(() => {
    openaiService = new OpenAIService();
    jest.clearAllMocks();

    // Set up test environment
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.BAILEYS_AUTH_DIR = ".baileys_auth_test";
    process.env.TARGET_GROUP_NAME = "Test Target Group";
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Complete Message Processing Flow", () => {
    it("should process WhatsApp message through full pipeline", async () => {
      // 1. Simulate WhatsApp message reception
      const waMessage = createMockWAMessage(fixtures.hebrewSingleEvent.text, {
        chatId: "test-group@g.us",
        chatName: "Test Group",
        isGroup: true,
      });

      // 2. Extract message text
      const messageText = waMessage.message?.conversation || "";
      expect(messageText).toBeTruthy();

      // 3. Analyze with OpenAI
      const result = await openaiService.analyzeMessage(
        waMessage.key.remoteJid || "",
        messageText,
        "Test Group",
        "Test User"
      );

      // 4. Validate event extraction
      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);

      // 5. Verify event details
      const event = result.events[0];
      expect(event.isEvent).toBe(true);
      expect(event.title || event.summary).toBeTruthy();
      expect(event.startDateISO).toBeTruthy();

      // 6. Verify date is in future
      const startDate = new Date(event.startDateISO as string);
      expect(startDate.getTime()).toBeGreaterThan(
        Date.now() - 24 * 60 * 60 * 1000
      );
    });

    it("should process image messages with captions", async () => {
      const waMessage = createMockWAMessage("Event poster", {
        chatId: "test-group@g.us",
        hasImage: true,
        isGroup: true,
      });

      const caption = waMessage.message?.imageMessage?.caption || "";
      const result = await openaiService.analyzeMessage(
        waMessage.key.remoteJid || "",
        caption,
        "Test Group",
        "Test User",
        "mock-base64-image",
        "image/jpeg"
      );

      validateMultiEventResult(result);
      expect(result).toHaveProperty("hasEvents");
    });
  });

  describe("Conversation Context Flow", () => {
    it("should use conversation history for context", async () => {
      const messages = [
        {
          text: "Let's schedule the team meeting",
          timestamp: Date.now() - 120000,
        },
        { text: "How about tomorrow?", timestamp: Date.now() - 60000 },
        { text: "2pm works for everyone?", timestamp: Date.now() - 30000 },
        { text: "Perfect! See you then", timestamp: Date.now() },
      ];

      const result = await openaiService.analyzeMessage(
        "test-group@g.us",
        messages[messages.length - 1].text,
        "Test Group",
        "Test User",
        messages.slice(0, -1)
      );

      validateMultiEventResult(result);
    });
  });

  describe("Sequential Message Processing", () => {
    it("should handle multiple messages in sequence", async () => {
      const messages = [
        fixtures.hebrewSingleEvent.text,
        fixtures.englishEvent.text,
        fixtures.hebrewMultipleEvents.text,
      ];

      const results = [];
      for (const message of messages) {
        const result = await openaiService.analyzeMessage(
          "test-group@g.us",
          message,
          "Test Group",
          "Test User"
        );
        results.push(result);
      }

      expect(results.length).toBe(messages.length);
      results.forEach((result) => validateMultiEventResult(result));
    });
  });
});
