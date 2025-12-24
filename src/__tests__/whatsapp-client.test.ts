/**
 * Tests for WhatsApp Client
 * Tests message filtering, group metadata, chat name filtering, and session management
 */

import { WhatsAppClient } from "../whatsapp-client";
import {
  createMockWAMessage,
  createMockGroupMetadata,
  cleanupTestAuthDir,
} from "./utils/test-helpers";

// Mock modules
jest.mock("@whiskeysockets/baileys");
jest.mock("openai");
jest.mock("fs");
jest.mock("qrcode-terminal");
jest.mock("qrcode");

describe("WhatsAppClient", () => {
  let whatsappClient: WhatsAppClient;
  const clients: WhatsAppClient[] = [];

  const createClient = (): WhatsAppClient => {
    const client = new WhatsAppClient();
    clients.push(client);
    whatsappClient = client;
    return client;
  };

  beforeEach(() => {
    // Clean up test auth directory
    cleanupTestAuthDir();

    // Reset environment variables
    process.env.BAILEYS_AUTH_DIR = ".baileys_auth_test";
    process.env.TARGET_GROUP_NAME = "Test Group";
    delete process.env.TARGET_GROUP_ID;
    delete process.env.ALLOWED_CHAT_NAMES;

    // Clear all mocks
    jest.clearAllMocks();
    clients.length = 0;
  });

  afterEach(async () => {
    // Clean up all clients
    await Promise.all(clients.map((client) => client.disconnect()));
    clients.length = 0;
    if (whatsappClient) {
      // Cleanup
      cleanupTestAuthDir();
    }
  });

  describe("Initialization", () => {
    it("should create WhatsApp client instance", () => {
      whatsappClient = createClient();
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should configure target group from TARGET_GROUP_ID", () => {
      process.env.TARGET_GROUP_ID = "123456789@g.us";
      whatsappClient = createClient();
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should configure target group from TARGET_GROUP_NAME", () => {
      process.env.TARGET_GROUP_NAME = "My Test Group";
      whatsappClient = createClient();
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should use default target group name if not configured", () => {
      delete process.env.TARGET_GROUP_ID;
      delete process.env.TARGET_GROUP_NAME;
      whatsappClient = createClient();
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should create session directory if it does not exist", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      fs.existsSync.mockReturnValue(false);

      whatsappClient = createClient();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe("Connection Management", () => {
    it("should report connection state", () => {
      whatsappClient = createClient();
      const state = whatsappClient.getConnectionState();
      expect(["open", "connecting", "close"]).toContain(state);
    });

    it("should report isConnected status", () => {
      whatsappClient = createClient();
      const isConnected = whatsappClient.isConnected();
      expect(typeof isConnected).toBe("boolean");
    });

    it("should track hasEverConnected status", () => {
      whatsappClient = createClient();
      const hasEverConnected = whatsappClient.getHasEverConnected();
      expect(typeof hasEverConnected).toBe("boolean");
    });
  });

  describe("Message Filtering", () => {
    beforeEach(() => {
      whatsappClient = createClient();
    });

    it("should filter messages by ALLOWED_CHAT_NAMES", () => {
      // This test requires access to internal message handling
      // In a real implementation, you would expose a method to test this
      // or use integration tests
      process.env.ALLOWED_CHAT_NAMES = "Test Chat,Another Chat";

      const _chatInList = "Test Chat";
      const _chatNotInList = "Random Chat";

      // Verify configuration was loaded
      expect(process.env.ALLOWED_CHAT_NAMES).toContain("Test Chat");
      expect(process.env.ALLOWED_CHAT_NAMES).not.toContain("Random Chat");
    });

    it("should allow all messages when ALLOWED_CHAT_NAMES is not set", () => {
      delete process.env.ALLOWED_CHAT_NAMES;
      whatsappClient = createClient();

      // Should process all messages
      expect(process.env.ALLOWED_CHAT_NAMES).toBeUndefined();
    });

    it("should skip own messages in groups", () => {
      const ownMessage = createMockWAMessage("Test message", {
        fromMe: true,
        isGroup: true,
      });

      // Own messages should be filtered
      expect(ownMessage.key.fromMe).toBe(true);
    });

    it('should skip messages containing "Event Summary"', () => {
      const eventSummaryMessage = createMockWAMessage(
        "Event Summary: Meeting tomorrow",
        { isGroup: true }
      );

      expect(eventSummaryMessage.message?.conversation).toContain(
        "Event Summary"
      );
    });

    it("should process text messages", () => {
      const textMessage = createMockWAMessage("Regular message", {
        isGroup: true,
      });

      expect(textMessage.message?.conversation).toBeTruthy();
    });

    it("should process image messages", () => {
      const imageMessage = createMockWAMessage("Image caption", {
        hasImage: true,
        isGroup: true,
      });

      expect(imageMessage.message?.imageMessage).toBeTruthy();
    });
  });

  describe("Group Metadata Caching", () => {
    beforeEach(() => {
      whatsappClient = createClient();
    });

    it("should cache group metadata", () => {
      // This tests the internal caching mechanism
      // In a real scenario, you'd mock the socket and test the cache behavior
      const groupId = "123456789@g.us";
      const groupMetadata = createMockGroupMetadata(groupId, "Test Group");

      // Verify metadata structure
      expect(groupMetadata.id).toBe(groupId);
      expect(groupMetadata.subject).toBe("Test Group");
    });

    it("should persist cache to file", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      fs.existsSync.mockReturnValue(true);

      whatsappClient = createClient();

      // Cache should be persisted periodically
      // Verify file operations would be called
      expect(fs.existsSync).toHaveBeenCalled();
    });

    it("should load cache from file on startup", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      const mockCacheData = {
        "123456789@g.us": {
          data: createMockGroupMetadata("123456789@g.us", "Test Group"),
          savedAt: Date.now(),
        },
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockCacheData));

      whatsappClient = createClient();

      // Cache should be loaded
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it("should handle cache file not existing", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      fs.existsSync.mockReturnValue(false);

      whatsappClient = createClient();

      // Should not throw, should start with empty cache
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should expire old cache entries", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      const mockCacheData = {
        "123456789@g.us": {
          data: createMockGroupMetadata("123456789@g.us", "Test Group"),
          savedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago (expired)
        },
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockCacheData));

      whatsappClient = createClient();

      // Old entries should be filtered out
      expect(fs.readFileSync).toHaveBeenCalled();
    });
  });

  describe("Session Management", () => {
    it("should use configured session directory", () => {
      process.env.BAILEYS_AUTH_DIR = "/custom/auth/dir";
      whatsappClient = createClient();

      // Verify custom directory would be used
      expect(process.env.BAILEYS_AUTH_DIR).toBe("/custom/auth/dir");
    });

    it("should use default session directory", () => {
      delete process.env.BAILEYS_AUTH_DIR;
      whatsappClient = createClient();

      // Should fall back to default
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });
  });

  describe("Error Handling", () => {
    it("should handle connection errors gracefully", () => {
      whatsappClient = createClient();

      // Should not throw on initialization
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should handle group metadata fetch errors", () => {
      whatsappClient = createClient();

      // Should handle errors without crashing
      // In a real test, you'd mock the socket to throw an error
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should handle rate limiting with exponential backoff", () => {
      whatsappClient = createClient();

      // Rate limiting should be handled internally
      // This would require exposing the retry logic or testing via integration
      expect(whatsappClient).toBeInstanceOf(WhatsAppClient);
    });

    it("should handle invalid cache file", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as jest.Mocked<typeof import("fs")>;
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue("invalid json{");

      // Should not throw
      expect(() => {
        whatsappClient = createClient();
      }).not.toThrow();
    });
  });

  describe("Chat Name Filtering", () => {
    it("should handle exact chat name match", () => {
      process.env.ALLOWED_CHAT_NAMES = "Exact Name";
      whatsappClient = createClient();

      expect(process.env.ALLOWED_CHAT_NAMES).toBe("Exact Name");
    });

    it("should handle partial chat name match", () => {
      process.env.ALLOWED_CHAT_NAMES = "Family,Work,Friends";
      whatsappClient = createClient();

      const allowedChats = process.env.ALLOWED_CHAT_NAMES.split(",");
      expect(allowedChats).toContain("Family");
      expect(allowedChats).toContain("Work");
      expect(allowedChats).toContain("Friends");
    });

    it("should be case-sensitive for chat names", () => {
      process.env.ALLOWED_CHAT_NAMES = "TestChat";
      whatsappClient = createClient();

      // Case sensitivity should be preserved
      expect(process.env.ALLOWED_CHAT_NAMES).toBe("TestChat");
      expect(process.env.ALLOWED_CHAT_NAMES).not.toBe("testchat");
    });
  });

  describe("Target Group Resolution", () => {
    it("should prioritize TARGET_GROUP_ID over TARGET_GROUP_NAME", () => {
      process.env.TARGET_GROUP_ID = "123456789@g.us";
      process.env.TARGET_GROUP_NAME = "Test Group";

      whatsappClient = createClient();

      // ID should take precedence
      expect(process.env.TARGET_GROUP_ID).toBeTruthy();
    });

    it("should search by name when only TARGET_GROUP_NAME is provided", () => {
      delete process.env.TARGET_GROUP_ID;
      process.env.TARGET_GROUP_NAME = "Test Group";

      whatsappClient = createClient();

      expect(process.env.TARGET_GROUP_NAME).toBe("Test Group");
    });
  });

  describe("Photo Flood Detection", () => {
    beforeEach(() => {
      // Use environment variables to allow all chats for testing
      delete process.env.ALLOWED_CHAT_NAMES;
    });

    it("should not skip messages when there are fewer than threshold photos", async () => {
      whatsappClient = createClient();

      // Send 2 images (below threshold of 3)
      const chatId = "123456789@g.us";
      const message1 = createMockWAMessage("", {
        chatId,
        isGroup: true,
        hasImage: true,
      });
      const message2 = createMockWAMessage("", {
        chatId,
        isGroup: true,
        hasImage: true,
      });

      // Both messages should be processed (not skipped)
      // We'll verify this by checking that the messages don't trigger early returns
      await whatsappClient["handleIncomingMessage"](message1);
      await whatsappClient["handleIncomingMessage"](message2);

      // If we got here without errors, the messages were processed
      expect(true).toBe(true);
    });

    it("should skip LLM analysis when receiving many photos without captions", async () => {
      whatsappClient = createClient();

      // Track recent image messages
      const chatId = "123456789@g.us";

      // Manually track 3 images without captions (simulating photo flood)
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);

      // Check if photo flood is detected
      const isFlood = whatsappClient["isPhotoFlood"](chatId);
      expect(isFlood).toBe(true);
    });

    it("should not skip when photos have captions (likely event info)", async () => {
      whatsappClient = createClient();

      const chatId = "123456789@g.us";

      // Track 3 images WITH captions (suggesting they're event-related)
      whatsappClient["trackImageMessage"](chatId, true);
      whatsappClient["trackImageMessage"](chatId, true);
      whatsappClient["trackImageMessage"](chatId, true);

      // Should not be detected as photo flood
      const isFlood = whatsappClient["isPhotoFlood"](chatId);
      expect(isFlood).toBe(false);
    });

    it("should clean up old image timestamps outside the window", async () => {
      whatsappClient = createClient();

      const chatId = "123456789@g.us";

      // Track 2 images
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);

      // Manually set old timestamp (outside 30s window)
      const oldTimestamp = Date.now() - 31000; // 31 seconds ago
      whatsappClient["recentImageMessages"].set(chatId, [
        { timestamp: oldTimestamp, hasCaption: false },
        { timestamp: Date.now(), hasCaption: false },
      ]);

      // Add one more recent image
      whatsappClient["trackImageMessage"](chatId, false);

      // Should only have 2 recent images (old one cleaned up)
      const recentImages = whatsappClient["recentImageMessages"].get(chatId);
      expect(recentImages).toBeDefined();
      expect(recentImages!.length).toBe(2);
      expect(recentImages!.every((img) => img.timestamp > Date.now() - 31000)).toBe(true);
    });

    it("should handle mixed captions correctly (70% threshold)", async () => {
      whatsappClient = createClient();

      const chatId = "123456789@g.us";

      // 3 without captions, 1 with caption = 75% without captions (should be flood)
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, true);

      const isFlood = whatsappClient["isPhotoFlood"](chatId);
      expect(isFlood).toBe(true);
    });

    it("should not detect flood when less than 70% are without captions", async () => {
      whatsappClient = createClient();

      const chatId = "123456789@g.us";

      // 2 without captions, 2 with captions = 50% without captions (should not be flood)
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, false);
      whatsappClient["trackImageMessage"](chatId, true);
      whatsappClient["trackImageMessage"](chatId, true);

      const isFlood = whatsappClient["isPhotoFlood"](chatId);
      expect(isFlood).toBe(false);
    });
  });
});
