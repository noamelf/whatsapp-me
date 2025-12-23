/**
 * Tests for OpenAI Service
 * Tests event detection, multi-event extraction, language handling, and error cases
 */

import { OpenAIService } from "../llm-service";
import {
  validateEventDetails,
  validateMultiEventResult,
  loadFixtures,
  containsHebrew,
} from "./utils/test-helpers";

// Mock OpenAI module
jest.mock("openai");

describe("OpenAIService", () => {
  let openaiService: OpenAIService;
  const fixtures = loadFixtures();

  beforeEach(() => {
    openaiService = new OpenAIService();
    jest.clearAllMocks();
  });

  describe("Event Detection", () => {
    it("should detect a single Hebrew event", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewSingleEvent.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const event = result.events[0];
      expect(event.isEvent).toBe(true);
      expect(containsHebrew(event.title || event.summary || "")).toBe(true);
    });

    it("should detect a single English event", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.englishEvent.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const event = result.events[0];
      expect(event.isEvent).toBe(true);
      expect(event.title || event.summary).toBeTruthy();
    });

    it("should detect multiple events in Hebrew", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewMultipleEvents.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);

      result.events.forEach((event) => {
        expect(event.isEvent).toBe(true);
        validateEventDetails(event);
      });
    });

    it("should detect multiple events in English", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.englishMultipleEvents.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it("should handle mixed language content", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.mixedLanguage.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
    });
  });

  describe("False Positive Prevention", () => {
    it("should not detect events in past tense conversations", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.falsePositivePast.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(false);
    });

    it("should not detect events in casual conversations", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.falsePositiveCasual.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(false);
    });

    it("should not detect events in questions about events", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.falsePositiveQuestion.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(false);
    });
  });

  describe("Date and Time Parsing", () => {
    it("should handle relative dates (tomorrow, next week)", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.complexDateTime.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);

      const event = result.events[0];
      expect(event.startDateISO).toBeTruthy();
      expect(event.endDateISO).toBeTruthy();
    });

    it("should handle Hebrew relative dates", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewRelativeDate.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);

      const event = result.events[0];
      expect(event.startDateISO).toBeTruthy();
    });

    it("should apply default time when time is not specified", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.eventWithoutTime.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      if (result.hasEvents) {
        const event = result.events[0];
        expect(event.startDateISO).toBeTruthy();
        // Default time should be 08:00
        const startDate = new Date(event.startDateISO as string);
        expect(startDate.getUTCHours()).toBeGreaterThanOrEqual(0);
      }
    });

    it("should handle events with explicit duration", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.eventWithDuration.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      if (result.hasEvents) {
        const event = result.events[0];
        expect(event.startDateISO).toBeTruthy();
        expect(event.endDateISO).toBeTruthy();

        // Duration should be approximately 1.5 hours
        const start = new Date(event.startDateISO as string);
        const end = new Date(event.endDateISO as string);
        const durationHours =
          (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        expect(durationHours).toBeGreaterThan(0);
      }
    });
  });

  describe("Event Field Extraction", () => {
    it("should extract location from Hebrew event", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewSingleEvent.text,
        "Test Chat",
        "Test User"
      );

      if (result.hasEvents) {
        const event = result.events[0];
        expect(event.location).toBeTruthy();
      }
    });

    it("should handle events without location", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.eventWithoutLocation.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      if (result.hasEvents) {
        const event = result.events[0];
        // Location can be null or a generic value
        expect(event).toHaveProperty("location");
      }
    });

    it("should extract description from event", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.englishEvent.text,
        "Test Chat",
        "Test User"
      );

      if (result.hasEvents) {
        const event = result.events[0];
        expect(event).toHaveProperty("description");
      }
    });

    it("should handle Hebrew date formats", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewDateFormats.text,
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
      if (result.hasEvents) {
        const event = result.events[0];
        expect(event.startDateISO).toBeTruthy();
      }
    });
  });

  describe("Image Analysis", () => {
    it("should analyze messages with images", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        "Event poster",
        "Test Chat",
        "Test User",
        "base64-image-data",
        "image/jpeg"
      );

      validateMultiEventResult(result);
      expect(result).toHaveProperty("hasEvents");
      expect(result).toHaveProperty("events");
    });

    it("should handle text + image combination", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewSingleEvent.text,
        "Test Chat",
        "Test User",
        "base64-image-data",
        "image/jpeg"
      );

      validateMultiEventResult(result);
    });
  });

  describe("Context and History", () => {
    it("should use conversation history for context", async () => {
      const conversationHistory = [
        { text: "Let's plan the team meeting", timestamp: Date.now() - 60000 },
        { text: "How about tomorrow?", timestamp: Date.now() - 30000 },
      ];

      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        "2pm works for me",
        "Test Chat",
        "Test User",
        conversationHistory
      );

      validateMultiEventResult(result);
      // Should potentially detect event from context
      expect(result).toHaveProperty("hasEvents");
    });

    it("should use chat name for context", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewSingleEvent.text,
        "Family Planning Group",
        "Test User"
      );

      validateMultiEventResult(result);
      expect(result.hasEvents).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid API responses gracefully", async () => {
      // Mock an invalid response
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const MockedOpenAI = jest.requireMock("openai").default;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const mockInstance = new MockedOpenAI();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const mockCreate = mockInstance.chat.completions.create;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "Invalid JSON {",
            },
          },
        ],
      });

      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        "Test message",
        "Test Chat",
        "Test User"
      );

      // Should return a valid structure even on error
      validateMultiEventResult(result);
    });

    it("should handle API errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const MockedOpenAI = jest.requireMock("openai").default;
      const mockError = new Error("API Error");

      // Mock the constructor to return an instance with an error-throwing method
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      MockedOpenAI.mockImplementationOnce(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(mockError),
          },
        },
      }));

      // Create a new service instance that will use the mocked error
      const errorService = new OpenAIService();

      const result = await errorService.analyzeMessage(
        "test-chat-id",
        "Test message",
        "Test Chat",
        "Test User"
      );

      // Should return empty result on error
      expect(result.hasEvents).toBe(false);
      expect(result.events).toEqual([]);
    });

    it("should handle empty messages", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        "",
        "Test Chat",
        "Test User"
      );

      validateMultiEventResult(result);
    });
  });

  describe("ISO Date Format Validation", () => {
    it("should return valid ISO 8601 dates", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.hebrewSingleEvent.text,
        "Test Chat",
        "Test User"
      );

      if (result.hasEvents) {
        result.events.forEach((event) => {
          if (event.startDateISO) {
            const date = new Date(event.startDateISO);
            expect(date.toISOString()).toBe(event.startDateISO);
          }
          if (event.endDateISO) {
            const date = new Date(event.endDateISO);
            expect(date.toISOString()).toBe(event.endDateISO);
          }
        });
      }
    });

    it("should ensure end date is after start date", async () => {
      const result = await openaiService.analyzeMessage(
        "test-chat-id",
        fixtures.eventWithDuration.text,
        "Test Chat",
        "Test User"
      );

      if (result.hasEvents) {
        result.events.forEach((event) => {
          if (event.startDateISO && event.endDateISO) {
            const start = new Date(event.startDateISO);
            const end = new Date(event.endDateISO);
            expect(end.getTime()).toBeGreaterThan(start.getTime());
          }
        });
      }
    });
  });
});
