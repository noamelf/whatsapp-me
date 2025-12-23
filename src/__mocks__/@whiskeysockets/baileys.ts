/**
 * Mock for @whiskeysockets/baileys
 * Provides mock implementations of WhatsApp client functions for testing
 */

import { EventEmitter } from "events";

// Mock connection states
export type WAConnectionState = "open" | "connecting" | "close";

export const DisconnectReason = {
  connectionClosed: 428,
  connectionLost: 408,
  connectionReplaced: 440,
  timedOut: 408,
  loggedOut: 401,
  badSession: 500,
  restartRequired: 515,
};

// Mock message types
export interface WAMessage {
  key: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
    participant?: string;
  };
  message?: unknown;
  messageTimestamp?: number;
  pushName?: string;
}

export interface GroupMetadata {
  id: string;
  subject: string;
  owner?: string;
  creation?: number;
  participants: GroupParticipant[];
  size?: number;
  restrict?: boolean;
  announce?: boolean;
  ephemeralDuration?: number;
}

export interface GroupParticipant {
  id: string;
  admin?: "admin" | "superadmin" | null;
}

// Mock socket that extends EventEmitter
class MockWASocket extends EventEmitter {
  public user: { id: string; name: string } = {
    id: "mock-user-id@s.whatsapp.net",
    name: "Mock User",
  };

  public authState: {
    creds: Record<string, unknown>;
    keys: Record<string, unknown>;
  } = {
    creds: {},
    keys: {},
  };

  async groupMetadata(jid: string): Promise<GroupMetadata> {
    return Promise.resolve({
      id: jid,
      subject: "Mock Group",
      participants: [],
      size: 2,
    });
  }

  async groupFetchAllParticipating(): Promise<Record<string, GroupMetadata>> {
    return Promise.resolve({
      "mock-group@g.us": {
        id: "mock-group@g.us",
        subject: "Mock Group",
        participants: [],
        size: 2,
      },
    });
  }

  async sendMessage(
    jid: string,
    content: unknown,
    _options?: unknown
  ): Promise<WAMessage> {
    return Promise.resolve({
      key: {
        remoteJid: jid,
        fromMe: true,
        id: `MOCK_${Date.now()}`,
      },
      message: content,
    });
  }

  async downloadMediaMessage(
    _message: WAMessage,
    _type?: string
  ): Promise<Buffer> {
    return Promise.resolve(Buffer.from("mock-image-data"));
  }

  end(): void {
    this.emit("connection.update", { connection: "close" });
  }
}

// Mock makeWASocket function
export default function makeWASocket(_config?: unknown): MockWASocket {
  const socket = new MockWASocket();

  // Simulate connection after a short delay
  setTimeout(() => {
    socket.emit("connection.update", {
      connection: "open",
      qr: undefined,
    });
  }, 100);

  return socket;
}

// Mock auth state management
export async function useMultiFileAuthState(_folder: string): Promise<{
  state: {
    creds: { me: { id: string; name: string } };
    keys: Record<string, unknown>;
  };
  saveCreds: () => Promise<void>;
}> {
  return Promise.resolve({
    state: {
      creds: {
        me: {
          id: "mock-user@s.whatsapp.net",
          name: "Mock User",
        },
      },
      keys: {},
    },
    saveCreds: async () => {
      // Mock save credentials
      return Promise.resolve();
    },
  });
}

// Mock utility functions
export function isJidGroup(jid?: string): boolean {
  return jid?.endsWith("@g.us") || false;
}

export function jidNormalizedUser(jid: string): string {
  return jid.split("@")[0] + "@s.whatsapp.net";
}

export function getContentType(
  content?: Record<string, unknown>
): string | undefined {
  if (!content) return undefined;
  if ("conversation" in content) return "conversation";
  if ("extendedTextMessage" in content) return "extendedTextMessage";
  if ("imageMessage" in content) return "imageMessage";
  return Object.keys(content)[0];
}

export async function downloadMediaMessage(
  _message: WAMessage,
  _type: "buffer" | "stream"
): Promise<Buffer> {
  return Promise.resolve(Buffer.from("mock-media-data"));
}

export const Browsers = {
  ubuntu: (version: string) => ["Ubuntu", "Chrome", version],
  macOS: (version: string) => ["Mac OS", "Safari", version],
  windows: (version: string) => ["Windows", "Chrome", version],
  appropriate: (version: string) => ["WhatsApp", "Chrome", version],
};

// Export type alias
export type WASocket = MockWASocket;
