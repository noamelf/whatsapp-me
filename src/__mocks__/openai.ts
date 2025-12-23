/**
 * Mock for OpenAI API
 * Provides mock implementations for testing without making real API calls
 */

import type { MultiEventResult } from "../llm-service";

// Mock response templates
const mockResponses: Record<string, MultiEventResult> = {
  hebrewEvent: {
    hasEvents: true,
    events: [
      {
        isEvent: true,
        summary: "פגישה בקפה נחלת בנימין",
        title: "פגישה בקפה",
        date: "מחר",
        time: "10:00",
        location: "קפה נחלת בנימין",
        description: "פגישה בקפה",
        startDateISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDateISO: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  englishEvent: {
    hasEvents: true,
    events: [
      {
        isEvent: true,
        summary: "Office Meeting",
        title: "Meeting",
        date: "tomorrow",
        time: "14:00",
        location: "Office",
        description: "Team meeting at the office",
        startDateISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDateISO: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  multipleEvents: {
    hasEvents: true,
    events: [
      {
        isEvent: true,
        summary: "יום יצירה",
        title: "יום יצירה",
        date: "22/12",
        time: "08:00",
        location: null,
        description: "יום יצירה",
        startDateISO: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDateISO: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
      {
        isEvent: true,
        summary: "טיול לכפר בלום",
        title: "כפר בלום",
        date: "23/12",
        time: "09:00",
        location: "כפר בלום",
        description: "נוסעים לכפר בלום",
        startDateISO: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        endDateISO: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  noEvent: {
    hasEvents: false,
    events: [
      {
        isEvent: false,
        summary: null,
        title: null,
        date: null,
        time: null,
        location: null,
        description: null,
        startDateISO: null,
        endDateISO: null,
      },
    ],
  },
};

// Mock OpenAI client
class MockOpenAI {
  public apiKey: string;

  constructor(config?: { apiKey?: string }) {
    this.apiKey = config?.apiKey || "mock-api-key";
  }

  chat = {
    completions: {
      // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
      create: jest.fn(async (params: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const messages = params.messages || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const userMessage = messages.find((m: any) => m.role === "user");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const content = userMessage?.content;

        // Determine response based on message content
        let response: MultiEventResult;

        // Extract text from content (could be string or array of content parts)
        let textContent = "";
        if (typeof content === "string") {
          textContent = content;
        } else if (Array.isArray(content)) {
          // Handle multi-modal content (text + image)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const textPart = content.find((c: any) => c.type === "text");
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          textContent = textPart?.text || "";
        }

        // Extract the actual message from the prompt
        // The prompt format is "...\nCurrent message:\n{message}\n\nSender:..."
        const messageMatch = textContent.match(
          /Current message:\s*\n([\s\S]*?)\n\nSender:/
        );
        const actualMessage = messageMatch
          ? messageMatch[1].trim()
          : textContent;

        // Empty message check first (before other checks)
        if (!actualMessage || !actualMessage.trim()) {
          response = mockResponses.noEvent;
        }
        // Check for false positives BEFORE positive checks (past events, questions, casual chat)
        else if (
          actualMessage.includes("?") || // Questions are not events - check this first!
          actualMessage.toLowerCase().includes("yesterday") ||
          actualMessage.toLowerCase().includes("went to") ||
          actualMessage.toLowerCase().includes("was great") ||
          actualMessage.toLowerCase().includes("how are you") ||
          actualMessage.toLowerCase().includes("grab coffee") ||
          actualMessage.toLowerCase().includes("sometime") ||
          actualMessage.toLowerCase().includes("what time is")
        ) {
          response = mockResponses.noEvent;
        }
        // Check for multi-event markers
        else if (
          (actualMessage.includes("יום ראשון") &&
            actualMessage.includes("יום שני")) ||
          actualMessage.toLowerCase().includes("team events this week") ||
          (actualMessage.toLowerCase().includes("monday") &&
            actualMessage.toLowerCase().includes("wednesday") &&
            actualMessage.toLowerCase().includes("friday"))
        ) {
          response = mockResponses.multipleEvents;
        }
        // Check for Hebrew events
        else if (
          actualMessage.includes("מחר") ||
          actualMessage.includes("פגישה")
        ) {
          response = mockResponses.hebrewEvent;
        }
        // Check for English events
        else if (
          actualMessage.toLowerCase().includes("tomorrow") ||
          actualMessage.toLowerCase().includes("meeting") ||
          actualMessage.toLowerCase().includes("next") ||
          actualMessage.toLowerCase().includes("appointment")
        ) {
          response = mockResponses.englishEvent;
        }
        // Default to no event for unknown patterns
        else {
          response = mockResponses.noEvent;
        }

        return {
          id: "mock-completion-id",
          object: "chat.completion",
          created: Date.now(),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          model: params.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(response),
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };
      }),
    },
  };
}

// Create a mock constructor that can be used with jest.requireMock
const OpenAIConstructor = jest.fn((config?: { apiKey?: string }) => {
  return new MockOpenAI(config);
});

// Attach prototype methods for test access
OpenAIConstructor.prototype = MockOpenAI.prototype;

// Export the mock class as default
export default OpenAIConstructor;

// Export mock responses for test assertions
export { mockResponses };
