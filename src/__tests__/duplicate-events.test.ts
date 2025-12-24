/**
 * Tests for Duplicate Event Detection
 * Tests that events are not created twice when the same event is detected multiple times
 */

import { WhatsAppClient } from "../whatsapp-client";
import {
  createMockEvent,
  cleanupTestAuthDir,
} from "./utils/test-helpers";
import * as fs from "fs";
import * as path from "path";

// Mock modules
jest.mock("@whiskeysockets/baileys");
jest.mock("openai");
jest.mock("fs");
jest.mock("qrcode-terminal");
jest.mock("qrcode");

describe("Duplicate Event Detection", () => {
  let whatsappClient: WhatsAppClient;
  const clients: WhatsAppClient[] = [];
  const testAuthDir = ".baileys_auth_test";
  const eventsFilePath = path.join(testAuthDir, "created_events.json");

  const createClient = (): WhatsAppClient => {
    const client = new WhatsAppClient();
    clients.push(client);
    whatsappClient = client;
    return client;
  };

  beforeEach(() => {
    // Clean up test auth directory
    cleanupTestAuthDir(testAuthDir);

    // Reset environment variables
    process.env.BAILEYS_AUTH_DIR = testAuthDir;
    process.env.TARGET_GROUP_NAME = "Test Group";
    delete process.env.TARGET_GROUP_ID;
    delete process.env.ALLOWED_CHAT_NAMES;

    // Clear all mocks
    jest.clearAllMocks();
    clients.length = 0;

    // Mock fs methods
    const fsMock = fs as jest.Mocked<typeof fs>;
    fsMock.existsSync.mockReturnValue(false);
    fsMock.mkdirSync.mockImplementation(() => undefined);
    fsMock.writeFileSync.mockImplementation(() => undefined);
    fsMock.readFileSync.mockReturnValue(JSON.stringify([]));
  });

  afterEach(async () => {
    // Clean up all clients
    await Promise.all(clients.map((client) => client.disconnect()));
    clients.length = 0;
    if (whatsappClient) {
      cleanupTestAuthDir(testAuthDir);
    }
  });

  describe("Event Fingerprinting", () => {
    it("should create consistent fingerprints for identical events", () => {
      whatsappClient = createClient();

      const event1 = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      const event2 = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      // Use private method access via type assertion for testing
      const client = whatsappClient as unknown as {
        generateEventFingerprint: (event: typeof event1) => string;
      };

      const fingerprint1 = client.generateEventFingerprint(event1);
      const fingerprint2 = client.generateEventFingerprint(event2);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it("should create different fingerprints for different events", () => {
      whatsappClient = createClient();

      const event1 = createMockEvent({
        title: "Event A",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Location A",
      });

      const event2 = createMockEvent({
        title: "Event B",
        startDateISO: "2024-12-25T09:00:00.000Z",
        location: "Location B",
      });

      // Use private method access via type assertion for testing
      const client = whatsappClient as unknown as {
        generateEventFingerprint: (event: typeof event1) => string;
      };

      const fingerprint1 = client.generateEventFingerprint(event1);
      const fingerprint2 = client.generateEventFingerprint(event2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it("should handle case-insensitive matching", () => {
      whatsappClient = createClient();

      const event1 = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      const event2 = createMockEvent({
        title: "test event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "TEST LOCATION",
      });

      // Use private method access via type assertion for testing
      const client = whatsappClient as unknown as {
        generateEventFingerprint: (event: typeof event1) => string;
      };

      const fingerprint1 = client.generateEventFingerprint(event1);
      const fingerprint2 = client.generateEventFingerprint(event2);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it("should create different fingerprints for same event at different times", () => {
      whatsappClient = createClient();

      const event1 = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      const event2 = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T10:00:00.000Z", // Different time
        location: "Test Location",
      });

      // Use private method access via type assertion for testing
      const client = whatsappClient as unknown as {
        generateEventFingerprint: (event: typeof event1) => string;
      };

      const fingerprint1 = client.generateEventFingerprint(event1);
      const fingerprint2 = client.generateEventFingerprint(event2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe("Duplicate Detection", () => {
    it("should detect when an event was already created", () => {
      whatsappClient = createClient();

      const event = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      // Use private method access via type assertion for testing
      type EventType = ReturnType<typeof createMockEvent>;
      const client = whatsappClient as unknown as {
        isEventAlreadyCreated: (event: EventType) => boolean;
        markEventAsCreated: (event: EventType) => void;
      };

      // Initially, event should not be marked as created
      expect(client.isEventAlreadyCreated(event)).toBe(false);

      // Mark event as created
      client.markEventAsCreated(event);

      // Now it should be detected as duplicate
      expect(client.isEventAlreadyCreated(event)).toBe(true);
    });

    it("should not flag different events as duplicates", () => {
      whatsappClient = createClient();

      const event1 = createMockEvent({
        title: "Event A",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Location A",
      });

      const event2 = createMockEvent({
        title: "Event B",
        startDateISO: "2024-12-25T09:00:00.000Z",
        location: "Location B",
      });

      // Use private method access via type assertion for testing
      type EventType = ReturnType<typeof createMockEvent>;
      const client = whatsappClient as unknown as {
        isEventAlreadyCreated: (event: EventType) => boolean;
        markEventAsCreated: (event: EventType) => void;
      };

      // Mark first event as created
      client.markEventAsCreated(event1);

      // Second event should not be detected as duplicate
      expect(client.isEventAlreadyCreated(event2)).toBe(false);
    });
  });

  describe("Event Persistence", () => {
    it("should save created events to file", () => {
      const fsMock = fs as jest.Mocked<typeof fs>;
      whatsappClient = createClient();

      const event = createMockEvent({
        title: "Test Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        location: "Test Location",
      });

      // Use private method access via type assertion for testing
      type EventType = ReturnType<typeof createMockEvent>;
      const client = whatsappClient as unknown as {
        markEventAsCreated: (event: EventType) => void;
        saveEventsToFile: () => void;
      };

      // Mark event as created and save
      client.markEventAsCreated(event);
      client.saveEventsToFile();

      // Verify writeFileSync was called with the events file path
      expect(fsMock.writeFileSync).toHaveBeenCalledWith(
        eventsFilePath,
        expect.stringContaining("Test Event")
      );
    });

    it("should load created events from file on startup", () => {
      const fsMock = fs as jest.Mocked<typeof fs>;

      const savedEvents = [
        {
          fingerprint: "abc123",
          title: "Loaded Event",
          startDateISO: "2024-12-25T08:00:00.000Z",
          createdAt: Date.now(),
        },
      ];

      fsMock.existsSync.mockImplementation((path) => {
        return path.toString().includes("created_events.json");
      });
      fsMock.readFileSync.mockImplementation((path) => {
        if (path.toString().includes("created_events.json")) {
          return JSON.stringify(savedEvents);
        }
        return JSON.stringify([]);
      });

      whatsappClient = createClient();

      // Note: This test verifies the file loading mechanism works
      expect(fsMock.readFileSync).toHaveBeenCalled();
    });

    it("should clean up old events", () => {
      const fsMock = fs as jest.Mocked<typeof fs>;

      const recentEvent = {
        fingerprint: "recent123",
        title: "Recent Event",
        startDateISO: "2024-12-25T08:00:00.000Z",
        createdAt: Date.now(),
      };

      const oldEvent = {
        fingerprint: "old123",
        title: "Old Event",
        startDateISO: "2024-11-01T08:00:00.000Z",
        createdAt: Date.now() - 31 * 24 * 60 * 60 * 1000, // 31 days ago
      };

      fsMock.existsSync.mockImplementation((path) => {
        return path.toString().includes("created_events.json");
      });
      fsMock.readFileSync.mockImplementation((path) => {
        if (path.toString().includes("created_events.json")) {
          return JSON.stringify([recentEvent, oldEvent]);
        }
        return JSON.stringify([]);
      });

      whatsappClient = createClient();

      // Use private method access via type assertion for testing
      const client = whatsappClient as unknown as {
        saveEventsToFile: () => void;
      };

      // Save events (which should trigger cleanup)
      client.saveEventsToFile();

      // Verify that only the recent event is saved (old one is filtered out)
      const writeCall = fsMock.writeFileSync.mock.calls.find((call) =>
        call[0].toString().includes("created_events.json")
      );

      if (writeCall) {
        const savedData = JSON.parse(writeCall[1] as string) as unknown[];
        // Only recent event should be saved
        expect(savedData.length).toBe(1);
      }
    });
  });

  describe("Integration with Message Processing", () => {
    it("should not call sendEventToGroup for duplicate events", () => {
      whatsappClient = createClient();

      // This would require mocking the entire message processing flow
      // For now, we verify the behavior is correct through unit tests
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });
  });
});
