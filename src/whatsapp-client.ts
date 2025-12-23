import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WAMessageKey,
  getContentType,
  isJidGroup,
  jidNormalizedUser,
  WAMessage,
  Browsers,
  downloadMediaMessage,
  type GroupMetadata,
  type WAConnectionState,
  type Chat,
  type GroupParticipant,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { Boom } from "@hapi/boom";
import * as fs from "fs";
import * as path from "path";
import * as qrcode from "qrcode-terminal";
import * as QRCode from "qrcode";
import NodeCache from "node-cache";
import { LLMService, type EventDetails } from "./openai-service";

// Type for cached group data persisted to file
interface PersistedCacheData {
  data: GroupMetadata;
  savedAt: number;
}

// Type for connection update from Baileys
interface BaileysConnectionUpdate {
  connection?: WAConnectionState;
  lastDisconnect?: {
    error?: Boom | Error;
    date?: Date;
  };
  qr?: string;
}

// Type for messages upsert event
interface MessagesUpsert {
  messages: WAMessage[];
  type: string;
}

type WASocketType = ReturnType<typeof makeWASocket>;

export class WhatsAppClient {
  private socket: WASocketType | null = null;
  private isReady = false;
  private hasEverConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private readonly sessionDir = process.env.BAILEYS_AUTH_DIR || ".baileys_auth";
  private readonly cacheFilePath: string;
  private llmService: LLMService;
  private targetGroupName = "אני"; // Default target group name (can be overridden via TARGET_GROUP_NAME env var)
  private targetGroupId: string | null = null;
  private shouldReconnect = true;
  private connectionState: WAConnectionState = "close";
  private groupCache: NodeCache;
  private cacheFlushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.groupCache = new NodeCache({ stdTTL: 30 * 60, useClones: false }); // 30 minute TTL
    this.cacheFilePath = path.join(this.sessionDir, "group_cache.json");
    this.llmService = new LLMService();

    // Configure target group from environment variables
    this.configureTargetGroup();

    // Ensure session directory exists
    this.ensureSessionDir();

    // Load persisted cache
    this.loadCacheFromFile();

    // Set up periodic cache saving (every 5 minutes)
    this.cacheFlushInterval = setInterval(() => {
      this.saveCacheToFile();
    }, 5 * 60 * 1000);

    // Save cache on process exit
    process.on("SIGTERM", () => {
      this.saveCacheToFile();
    });
    process.on("SIGINT", () => {
      this.saveCacheToFile();
    });
  }

  private configureTargetGroup(): void {
    // Read target group configuration from environment variables
    const envTargetGroupId = process.env.TARGET_GROUP_ID?.trim();
    const envTargetGroupName = process.env.TARGET_GROUP_NAME?.trim();

    if (envTargetGroupId) {
      // If TARGET_GROUP_ID is provided, use it directly
      this.targetGroupId = envTargetGroupId;
      // Also set the group name if provided, otherwise we'll fetch it later
      if (envTargetGroupName) {
        this.targetGroupName = envTargetGroupName;
      }
      console.log(
        `Using target group ID from environment: ${this.targetGroupId}`
      );
    } else if (envTargetGroupName) {
      // If only TARGET_GROUP_NAME is provided, use it for searching
      this.targetGroupName = envTargetGroupName;
      console.log(
        `Will search for target group by name: "${this.targetGroupName}"`
      );
    } else {
      // Use default value if nothing is configured in .env
      console.log(`Using default target group name: "${this.targetGroupName}"`);
    }
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * Save group cache to file for persistence across restarts
   */
  private saveCacheToFile(): void {
    try {
      const keys = this.groupCache.keys();
      const cacheData: Record<string, PersistedCacheData> = {};

      for (const key of keys) {
        const value = this.groupCache.get(key) as GroupMetadata | undefined;
        if (value) {
          cacheData[key] = {
            data: value,
            savedAt: Date.now(),
          };
        }
      }

      if (Object.keys(cacheData).length > 0) {
        fs.writeFileSync(
          this.cacheFilePath,
          JSON.stringify(cacheData, null, 2)
        );
        console.log(
          `Saved ${Object.keys(cacheData).length} group(s) to cache file`
        );
      }
    } catch (error) {
      console.error("Error saving cache to file:", error);
    }
  }

  /**
   * Load group cache from file on startup
   */
  private loadCacheFromFile(): void {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        console.log("No cache file found, starting fresh");
        return;
      }

      const data = fs.readFileSync(this.cacheFilePath, "utf-8");
      const cacheData = JSON.parse(data) as Record<string, PersistedCacheData>;

      const maxAge = 24 * 60 * 60 * 1000; // 24 hours max age for persisted cache
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [key, value] of Object.entries(cacheData)) {
        // Only load if not too old
        if (Date.now() - value.savedAt < maxAge) {
          this.groupCache.set(key, value.data);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      console.log(
        `Loaded ${loadedCount} group(s) from cache file (${expiredCount} expired)`
      );
    } catch (error) {
      console.error("Error loading cache from file:", error);
    }
  }

  /**
   * Fetch group metadata with rate limiting and exponential backoff
   */
  private async fetchGroupMetadataWithRetry(
    groupId: string,
    maxRetries = 3
  ): Promise<GroupMetadata | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check cache first
        const cached = this.groupCache.get(groupId) as
          | GroupMetadata
          | undefined;
        if (cached) {
          return cached;
        }

        if (!this.socket) {
          return null;
        }
        const metadata = await this.socket.groupMetadata(groupId);
        this.groupCache.set(groupId, metadata);
        return metadata;
      } catch (error: unknown) {
        const err = error as { data?: number; message?: string };
        const isRateLimit =
          err.data === 429 || err.message?.includes("rate-overlimit");

        if (isRateLimit && attempt < maxRetries - 1) {
          // Exponential backoff: 2s, 4s, 8s...
          const delay = Math.pow(2, attempt + 1) * 1000;
          console.log(
            `Rate limited fetching group ${groupId}, retrying in ${
              delay / 1000
            }s... (attempt ${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (!isRateLimit) {
          console.error(
            `Error fetching group metadata for ${groupId}:`,
            err.message ?? error
          );
          return null;
        }
      }
    }
    console.warn(
      `Failed to fetch group metadata for ${groupId} after ${maxRetries} attempts (rate limited)`
    );
    return null;
  }

  private async createSocket(): Promise<void> {
    try {
      console.log("Creating WhatsApp socket...");

      // Initialize auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      // Create a silent logger to suppress verbose JSON logs
      const logger = pino({ level: "silent" });

      // Create the socket
      this.socket = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu("WhatsApp Event Detection"),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        fireInitQueries: true,
        generateHighQualityLinkPreview: false,
        logger,
        cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
        getMessage: (_key: WAMessageKey) => {
          // Return empty message for now - could be enhanced with message store
          return Promise.resolve({ conversation: "" });
        },
      });

      this.setupEventListeners(saveCreds);
    } catch (error) {
      console.error("Error creating WhatsApp socket:", error);
      throw error;
    }
  }

  private setupEventListeners(saveCreds: () => void): void {
    if (!this.socket) return;

    // Handle connection updates
    this.socket.ev.on(
      "connection.update",
      async (update: BaileysConnectionUpdate) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(
            "QR Code received. Please scan with your WhatsApp mobile app."
          );
          // Generate terminal QR code
          qrcode.generate(qr, { small: true });

          // Generate a secure data URL that can be opened locally in a browser
          // This is secure because the QR data never leaves your machine
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
            console.log(
              "\n📱 Can't see the QR code? Copy and paste this URL into your browser:"
            );
            console.log(qrDataUrl);
            console.log("");
          } catch {
            console.log(
              "\n📱 Can't see the QR code? Try adjusting your terminal size."
            );
          }
        }

        if (connection === "close") {
          this.connectionState = "close";
          this.isReady = false;

          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;
          console.log(
            "Connection closed due to:",
            lastDisconnect?.error,
            ", reconnecting:",
            shouldReconnect
          );

          if (
            shouldReconnect &&
            this.shouldReconnect &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this.reconnectAttempts++;
            console.log(
              `Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
            );

            // Wait before reconnecting
            await new Promise((resolve) => setTimeout(resolve, 5000));
            await this.createSocket();
          } else if (!shouldReconnect) {
            console.log(
              "Logged out. Please restart the application and scan QR code again."
            );
          } else {
            console.log(
              "Max reconnection attempts reached. Please restart the application."
            );
          }
        } else if (connection === "open") {
          this.connectionState = "open";
          this.isReady = true;
          this.hasEverConnected = true;
          this.reconnectAttempts = 0;
          console.log("WhatsApp connection opened successfully!");

          // Find the target group when connection is established
          await this.findTargetGroup();
        } else if (connection === "connecting") {
          this.connectionState = "connecting";
          console.log("Connecting to WhatsApp...");
        }
      }
    );

    // Handle credential updates
    this.socket.ev.on("creds.update", saveCreds);

    // Handle incoming messages
    this.socket.ev.on(
      "messages.upsert",
      async (messageUpdate: MessagesUpsert) => {
        const { messages, type } = messageUpdate;

        if (type !== "notify") return;

        for (const message of messages) {
          await this.handleIncomingMessage(message);
        }
      }
    );

    // Handle group updates
    this.socket.ev.on(
      "groups.update",
      async (updates: Partial<GroupMetadata>[]) => {
        // Process updates with a small delay between each to avoid rate limiting
        for (const update of updates) {
          if (!update.id) continue;
          // Update group metadata cache with rate limiting
          const metadata = await this.fetchGroupMetadataWithRetry(update.id);
          if (metadata) {
            console.log(
              `Updated group metadata cache for: ${
                metadata.subject || update.id
              }`
            );
          }

          if (update.subject && !this.targetGroupId) {
            // Check if this is our target group (only if not already configured from env)
            if (update.subject === this.targetGroupName) {
              this.targetGroupId = update.id;
              console.log(
                `Found target group "${this.targetGroupName}" with ID: ${this.targetGroupId}`
              );
            }
          }

          // Small delay between processing updates to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    );

    // Handle group participants update
    this.socket.ev.on(
      "group-participants.update",
      async (event: { id: string }) => {
        // Update group metadata cache when participants change with rate limiting
        const metadata = await this.fetchGroupMetadataWithRetry(event.id);
        if (metadata) {
          console.log(
            `Updated group metadata cache for participant change in: ${
              metadata.subject || event.id
            }`
          );
        }
      }
    );

    // Handle chats update
    this.socket.ev.on("chats.upsert", (chats: Chat[]) => {
      // Look for our target group in new chats (only if not already configured from env)
      for (const chat of chats) {
        if (
          chat.id &&
          isJidGroup(chat.id) &&
          chat.name === this.targetGroupName &&
          !this.targetGroupId
        ) {
          this.targetGroupId = chat.id;
          console.log(
            `Found target group "${this.targetGroupName}" with ID: ${this.targetGroupId}`
          );
        }
      }
    });
  }

  private async handleIncomingMessage(message: WAMessage): Promise<void> {
    try {
      // Skip if message has no content
      if (!message.message) return;

      const chatId = message.key.remoteJid;
      if (!chatId) return;
      const isGroup = isJidGroup(chatId);

      // Only process messages from:
      // 1. Groups/communities
      // 2. Self-chat (messages to yourself for testing)
      const isSelfChat = message.key.fromMe && !isGroup;
      if (!isGroup && !isSelfChat) return;

      // In groups, skip our own messages to avoid loops
      if (isGroup && message.key.fromMe) return;

      const messageType = getContentType(message.message);
      if (
        !messageType ||
        (messageType !== "conversation" &&
          messageType !== "extendedTextMessage" &&
          messageType !== "imageMessage")
      ) {
        return; // Only process text and image messages
      }

      // Extract message text and/or image
      let messageText = "";
      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;

      if (messageType === "conversation") {
        messageText = message.message.conversation || "";
      } else if (messageType === "extendedTextMessage") {
        messageText = message.message.extendedTextMessage?.text || "";
      } else if (messageType === "imageMessage") {
        // Get caption if present
        messageText = message.message.imageMessage?.caption || "";
        imageMimeType = message.message.imageMessage?.mimetype || "image/jpeg";

        // Download the image
        try {
          if (!this.socket) throw new Error("Socket not connected");
          const buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
              logger: pino({ level: "silent" }),
              reuploadRequest: this.socket.updateMediaMessage,
            }
          );
          if (buffer) {
            imageBase64 = buffer.toString("base64");
            console.log(`Downloaded image (${buffer.length} bytes)`);
          }
        } catch (error) {
          console.error("Error downloading image:", error);
        }
      }

      // Skip if no text and no image
      if (!messageText.trim() && !imageBase64) return;

      // Skip messages that are event summaries to avoid loops
      if (
        messageText.includes("Event Summary:") ||
        messageText.includes("Event details") ||
        messageText.includes("פרטי האירוע:")
      ) {
        return;
      }

      // Process both group and private chats for event detection

      const timestamp = new Date().toLocaleTimeString();

      let chatName = "";
      let contactName = "Unknown";

      // Get chat and contact information
      try {
        if (isGroup && this.socket) {
          const groupMetadata = await this.socket.groupMetadata(chatId);
          chatName = groupMetadata.subject || "Unknown Group";

          // Find the participant who sent the message
          const participant = groupMetadata.participants.find(
            (p: GroupParticipant) =>
              jidNormalizedUser(p.id) ===
              jidNormalizedUser(message.key.participant || "")
          );
          contactName =
            participant?.notify || participant?.id?.split("@")[0] || "Unknown";
        } else {
          chatName = chatId.split("@")[0];
          contactName = chatName;
        }
      } catch (error) {
        console.error("Error getting chat/contact info:", error);
      }

      // Log the message
      console.log(`\n--------------------------------`);
      console.log(
        `[${timestamp}] ${
          isGroup ? `[${chatName}]` : ""
        } ${contactName}: ${messageText}`
      );

      // Add message to history for this chat
      this.llmService.addMessageToHistory(chatId, messageText);

      // Process the message (shared logic with test endpoint)
      await this.processMessageForEvents(
        chatId,
        messageText,
        chatName,
        contactName,
        imageBase64,
        imageMimeType
      );
    } catch (error) {
      console.error("Error handling incoming message:", error);
    }
  }

  private async findTargetGroup(): Promise<void> {
    if (!this.socket || !this.isReady) return;

    try {
      // If we already have the target group ID from environment variables, no need to search
      if (this.targetGroupId) {
        console.log(
          `Target group ID already configured: ${this.targetGroupId}`
        );
        return;
      }

      console.log(`Looking for target group: "${this.targetGroupName}"`);

      // Actively search for the group by fetching all participating groups
      const groups = await this.socket.groupFetchAllParticipating();
      console.log(
        `Found ${Object.keys(groups).length} groups. Searching for "${
          this.targetGroupName
        }"...`
      );

      for (const [groupId, groupMetadata] of Object.entries(groups)) {
        console.log(`  - Group: "${groupMetadata.subject}" (ID: ${groupId})`);
        if (groupMetadata.subject === this.targetGroupName) {
          this.targetGroupId = groupId;
          console.log(
            `✅ Found target group "${this.targetGroupName}" with ID: ${this.targetGroupId}`
          );
          return;
        }
      }

      // If not found by exact match, try partial match
      for (const [groupId, groupMetadata] of Object.entries(groups)) {
        if (
          groupMetadata.subject?.includes(this.targetGroupName) ||
          this.targetGroupName.includes(groupMetadata.subject || "")
        ) {
          this.targetGroupId = groupId;
          console.log(
            `✅ Found target group (partial match) "${groupMetadata.subject}" with ID: ${this.targetGroupId}`
          );
          return;
        }
      }

      console.log(
        `❌ Target group "${this.targetGroupName}" not found. Available groups listed above.`
      );
    } catch (error) {
      console.error("Error finding target group:", error);
    }
  }

  private async sendMessageToGroup(
    groupId: string,
    message: string
  ): Promise<void> {
    if (!this.socket || !this.isReady) {
      console.error("WhatsApp socket not ready");
      return;
    }

    try {
      await this.socket.sendMessage(groupId, { text: message });
    } catch (error) {
      console.error("Error sending message to group:", error);
    }
  }

  /**
   * Process a message for event detection (shared by real messages and test endpoint)
   */
  private async processMessageForEvents(
    chatId: string,
    messageText: string,
    chatName: string,
    contactName: string,
    imageBase64: string | null = null,
    imageMimeType: string | null = null,
    sendToWhatsApp = true
  ): Promise<{
    hasEvents: boolean;
    events: EventDetails[];
    formattedMessages?: string[];
  }> {
    // Analyze the message for events
    console.log(
      `Analyzing message for events...${imageBase64 ? " (with image)" : ""}`
    );

    const analysis = await this.llmService.analyzeMessage(
      chatId,
      messageText,
      chatName,
      contactName,
      imageBase64,
      imageMimeType
    );

    const formattedMessages: string[] = [];

    if (analysis.hasEvents && analysis.events.length > 0) {
      console.log(`${analysis.events.length} event(s) detected!`);

      for (const event of analysis.events) {
        if (event.isEvent && event.summary) {
          console.log(`Event detected! Summary: ${event.summary}`);
          console.log(`Event details:`, {
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            description: event.description,
            startDateISO: event.startDateISO,
            endDateISO: event.endDateISO,
          });

          // Format the message for response
          if (event.title && event.startDateISO) {
            const formattedMessage = this.formatEventMessage(event, chatName);
            formattedMessages.push(formattedMessage);

            // Only send to WhatsApp if requested (not for test endpoint)
            if (sendToWhatsApp && this.targetGroupId) {
              await this.sendEventToGroup(this.targetGroupId, event, chatName);
              console.log(`Event sent to "${this.targetGroupName}" group`);
            } else if (sendToWhatsApp && !this.targetGroupId) {
              console.log(
                `Target group "${this.targetGroupName}" not found. Event not sent.`
              );
            }
          }
        }
      }
    }

    return {
      hasEvents: analysis.hasEvents,
      events: analysis.events,
      formattedMessages:
        formattedMessages.length > 0 ? formattedMessages : undefined,
    };
  }

  private async sendEventToGroup(
    groupId: string,
    eventDetails: EventDetails,
    sourceGroupName?: string
  ): Promise<void> {
    if (!this.socket || !this.isReady) {
      console.error("WhatsApp socket not ready");
      return;
    }

    try {
      // Send as WhatsApp native event message
      if (
        eventDetails.title &&
        eventDetails.startDateISO &&
        eventDetails.endDateISO
      ) {
        try {
          const startDate = new Date(eventDetails.startDateISO);
          const endDate = new Date(eventDetails.endDateISO);

          // Build event description with source group info
          let eventDescription = eventDetails.description || "";
          if (sourceGroupName) {
            eventDescription = `מקור: ${sourceGroupName}\n\n${eventDescription}`;
          }

          await this.socket.sendMessage(groupId, {
            event: {
              name: eventDetails.title,
              description: eventDescription.trim() || undefined,
              startDate: startDate,
              endDate: endDate,
              location: eventDetails.location
                ? {
                    degreesLatitude: 0,
                    degreesLongitude: 0,
                    name: eventDetails.location,
                  }
                : undefined,
            },
          });
        } catch (error) {
          console.error(
            "Failed to send event message, sending text only:",
            error
          );
          // Fallback to text message if event message fails
          const textMessage = this.formatEventMessage(
            eventDetails,
            sourceGroupName
          );
          await this.socket.sendMessage(groupId, { text: textMessage });
        }
      } else {
        // If no complete event details, just send the text message
        const textMessage = this.formatEventMessage(
          eventDetails,
          sourceGroupName
        );
        await this.socket.sendMessage(groupId, { text: textMessage });
      }
    } catch (error) {
      console.error("Error sending event to group:", error);
    }
  }

  private formatEventMessage(
    eventDetails: EventDetails,
    sourceGroupName?: string
  ): string {
    let eventMessage = `📅 *${eventDetails.title || "אירוע"}*\n\n`;

    if (sourceGroupName) {
      eventMessage += `📱 מקור: ${sourceGroupName}\n\n`;
    }

    if (eventDetails.description) {
      eventMessage += `${eventDetails.description}\n\n`;
    }

    // Format the date/time in a simple readable way
    if (eventDetails.startDateISO) {
      const startDate = new Date(eventDetails.startDateISO);
      const formattedDate = startDate.toLocaleString("he-IL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jerusalem",
      });
      eventMessage += `🕐 ${formattedDate}`;

      // Add end time if different from start
      if (eventDetails.endDateISO) {
        const endDate = new Date(eventDetails.endDateISO);
        const endTime = endDate.toLocaleString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jerusalem",
        });
        eventMessage += ` - ${endTime}`;
      }
      eventMessage += `\n`;
    }

    if (eventDetails.location) {
      eventMessage += `📍 ${eventDetails.location}\n`;
    }

    return eventMessage;
  }

  public async initialize(): Promise<void> {
    try {
      console.log("Initializing WhatsApp client...");
      await this.createSocket();

      // Wait for connection to be established
      // Allow 5 minutes for QR code scanning on first setup
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes timeout for QR code scanning

      while (!this.isReady && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;

        if (attempts % 30 === 0) {
          console.log(
            `Waiting for WhatsApp connection... (${attempts}s) - Please scan the QR code above`
          );
        }
      }

      if (!this.isReady) {
        throw new Error(
          "Failed to establish WhatsApp connection within timeout period. Please restart and scan the QR code."
        );
      }

      console.log("WhatsApp client initialized successfully!");
    } catch (error) {
      console.error("Error initializing WhatsApp client:", error);
      throw error;
    }
  }

  public startListeningForMessages(): void {
    if (!this.isReady) {
      console.error("WhatsApp client is not ready. Please initialize first.");
      return;
    }

    console.log("Started listening for messages...");
    console.log(
      "The bot will now monitor all conversations for event-related discussions."
    );
    console.log(
      `Event summaries will be sent to the "${this.targetGroupName}" group when detected.`
    );
  }

  public async disconnect(): Promise<void> {
    this.shouldReconnect = false;

    // Clear the cache flush interval
    if (this.cacheFlushInterval) {
      clearInterval(this.cacheFlushInterval);
      this.cacheFlushInterval = null;
    }

    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (error) {
        console.error("Error during logout:", error);
      }
    }

    this.isReady = false;
    this.socket = null;
    console.log("WhatsApp client disconnected.");
  }

  public isConnected(): boolean {
    return this.isReady && this.connectionState === "open";
  }

  public getHasEverConnected(): boolean {
    return this.hasEverConnected;
  }

  public getConnectionState(): string {
    return this.connectionState;
  }

  public getTargetGroupName(): string {
    return this.targetGroupName;
  }

  /**
   * Test message processing without WhatsApp (for HTTP endpoint)
   */
  public async testMessage(
    text: string,
    chatName = "Test Chat",
    imageBase64: string | null = null,
    imageMimeType: string | null = null
  ): Promise<{
    hasEvents: boolean;
    events: EventDetails[];
    formattedMessages?: string[];
  }> {
    console.log(
      `\n[TEST MODE] Analyzing message from "${chatName}": ${text.substring(
        0,
        100
      )}...`
    );

    // Use the same processing logic as real messages, but don't send to WhatsApp
    return await this.processMessageForEvents(
      "test-chat-id",
      text,
      chatName,
      "Test User",
      imageBase64,
      imageMimeType,
      false // Don't send to WhatsApp for test endpoint
    );
  }
}
