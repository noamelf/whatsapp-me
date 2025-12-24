import type { WAMessage } from "@whiskeysockets/baileys";
import type { EventDetails, MultiEventResult } from "../../llm-service";

/**
 * Helper to create mock WhatsApp messages for testing
 */
export function createMockWAMessage(
  text: string,
  options: {
    chatId?: string;
    chatName?: string;
    fromMe?: boolean;
    isGroup?: boolean;
    participant?: string;
    hasImage?: boolean;
    timestamp?: number;
  } = {}
): WAMessage {
  const {
    chatId = "1234567890@s.whatsapp.net",
    fromMe = false,
    isGroup = false,
    participant = "9876543210@s.whatsapp.net",
    hasImage = false,
    timestamp = Date.now(),
  } = options;

  const message: WAMessage = {
    key: {
      remoteJid: chatId,
      fromMe,
      id: `TEST_${timestamp}_${Math.random()}`,
      participant: isGroup ? participant : undefined,
    },
    message: {
      conversation: hasImage ? undefined : text,
      ...(hasImage && {
        imageMessage: {
          caption: text,
          url: "https://example.com/test-image.jpg",
          mimetype: "image/jpeg",
        },
      }),
    },
    messageTimestamp: Math.floor(timestamp / 1000),
  };

  return message;
}

/**
 * Helper to create mock group metadata
 */
export function createMockGroupMetadata(groupId: string, groupName: string) {
  return {
    id: groupId,
    subject: groupName,
    owner: "1234567890@s.whatsapp.net",
    creation: Math.floor(Date.now() / 1000),
    participants: [
      {
        id: "1234567890@s.whatsapp.net",
        admin: "superadmin" as const,
      },
      {
        id: "9876543210@s.whatsapp.net",
        admin: null,
      },
    ],
    size: 2,
    restrict: false,
    announce: false,
    ephemeralDuration: 0,
  };
}

/**
 * Helper to validate EventDetails structure
 */
export function validateEventDetails(event: EventDetails): void {
  expect(event).toHaveProperty("isEvent");
  expect(event).toHaveProperty("summary");
  expect(event).toHaveProperty("title");
  expect(event).toHaveProperty("date");
  expect(event).toHaveProperty("time");
  expect(event).toHaveProperty("location");
  expect(event).toHaveProperty("description");
  expect(event).toHaveProperty("startDateISO");
  expect(event).toHaveProperty("endDateISO");

  if (event.isEvent) {
    // For actual events, some fields should be present
    expect(event.title || event.summary).toBeTruthy();

    // Validate ISO date formats if present
    if (event.startDateISO) {
      expect(() => new Date(event.startDateISO as string)).not.toThrow();
      expect(new Date(event.startDateISO as string).toISOString()).toBe(
        event.startDateISO
      );
    }

    if (event.endDateISO) {
      expect(() => new Date(event.endDateISO as string)).not.toThrow();
      expect(new Date(event.endDateISO as string).toISOString()).toBe(
        event.endDateISO
      );
    }

    // End date should be after start date
    if (event.startDateISO && event.endDateISO) {
      expect(new Date(event.endDateISO as string).getTime()).toBeGreaterThan(
        new Date(event.startDateISO as string).getTime()
      );
    }
  }
}

/**
 * Helper to validate MultiEventResult structure
 */
export function validateMultiEventResult(result: MultiEventResult): void {
  expect(result).toHaveProperty("hasEvents");
  expect(result).toHaveProperty("events");
  expect(Array.isArray(result.events)).toBe(true);

  if (result.hasEvents) {
    expect(result.events.length).toBeGreaterThan(0);
  }

  result.events.forEach((event) => validateEventDetails(event));
}

/**
 * Helper to wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Type for test fixture messages
 */
interface FixtureMessage {
  text: string;
  expectedEvents: number;
  expectedLanguage: string;
  description: string;
}

/**
 * Helper to load test fixtures
 */
export function loadFixtures(): Record<string, FixtureMessage> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require("../../__fixtures__/messages.json");
}

/**
 * Helper to create a mock OpenAI response
 */
export function createMockOpenAIResponse(
  events: Partial<EventDetails>[]
): MultiEventResult {
  return {
    hasEvents: events.length > 0 && events.some((e) => e.isEvent !== false),
    events: events.map((event) => ({
      isEvent: event.isEvent ?? true,
      summary: event.summary ?? null,
      title: event.title ?? "Test Event",
      date: event.date ?? null,
      time: event.time ?? null,
      location: event.location ?? null,
      description: event.description ?? null,
      startDateISO: event.startDateISO ?? new Date().toISOString(),
      endDateISO:
        event.endDateISO ?? new Date(Date.now() + 3600000).toISOString(),
    })),
  };
}

/**
 * Helper to check if text contains Hebrew characters
 */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Helper to clean up test auth directories
 */
export function cleanupTestAuthDir(dirPath = ".baileys_auth_test"): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");

  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Helper to create a mock event for testing
 */
export function createMockEvent(
  overrides: Partial<EventDetails> = {}
): EventDetails {
  return {
    isEvent: true,
    summary: overrides.summary ?? "Test Event Summary",
    title: overrides.title ?? "Test Event",
    date: overrides.date ?? "2024-12-25",
    time: overrides.time ?? "10:00",
    location: overrides.location ?? "Test Location",
    description: overrides.description ?? "Test Description",
    startDateISO:
      overrides.startDateISO ?? "2024-12-25T08:00:00.000Z",
    endDateISO:
      overrides.endDateISO ?? "2024-12-25T09:00:00.000Z",
  };
}
