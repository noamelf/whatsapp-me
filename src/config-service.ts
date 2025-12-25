import * as fs from "fs";
import * as path from "path";

/**
 * Configuration data structure stored in JSON file
 */
export interface ConfigData {
  allowedChatNames: string[];
  monitorAllGroupChats: boolean; // If true, monitor all group chats (overrides allowedChatNames)
  targetGroupId: string;
  targetGroupName: string;
  adminPassword: string; // Salted and hashed password for admin authentication (format: salt$hash)
  focusedInstructions: string; // Custom instructions to guide the LLM for better event detection
  lastUpdated: string;
}

/**
 * Service for managing persistent configuration
 * Stores settings in a JSON file and provides methods to read/write them
 */
export class ConfigService {
  private configFilePath: string;
  private config: ConfigData | null = null;
  private readonly sessionDir: string;

  constructor(sessionDir?: string) {
    this.sessionDir = sessionDir || process.env.BAILEYS_AUTH_DIR || ".baileys_auth";
    this.configFilePath = path.join(this.sessionDir, "admin_config.json");
    this.ensureSessionDir();
    this.loadConfig();
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, "utf-8");
        this.config = JSON.parse(data) as ConfigData;
        console.log("Loaded configuration from file");
      } else {
        // Initialize with environment variables or defaults
        this.config = this.getDefaultConfig();
        this.saveConfig();
        console.log("Initialized new configuration file with defaults");
      }
    } catch (error) {
      console.error("Error loading config file:", error);
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get default configuration from environment variables
   */
  private getDefaultConfig(): ConfigData {
    const allowedChatNamesStr = process.env.ALLOWED_CHAT_NAMES;
    const allowedChatNames = allowedChatNamesStr
      ? allowedChatNamesStr.split(",").map((name) => name.trim())
      : [];

    return {
      allowedChatNames,
      monitorAllGroupChats: false, // Default to false
      targetGroupId: process.env.TARGET_GROUP_ID?.trim() || "",
      targetGroupName: process.env.TARGET_GROUP_NAME?.trim() || "אני",
      adminPassword: process.env.ADMIN_PASSWORD || "", // Empty means no auth initially
      focusedInstructions: process.env.FOCUSED_INSTRUCTIONS || "", // Custom instructions for LLM
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      if (this.config) {
        this.config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(
          this.configFilePath,
          JSON.stringify(this.config, null, 2)
        );
        console.log("Configuration saved to file");
      }
    } catch (error) {
      console.error("Error saving config file:", error);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): ConfigData {
    if (!this.config) {
      this.loadConfig();
    }
    // At this point config should be loaded, but check to be safe
    if (!this.config) {
      throw new Error("Failed to load configuration");
    }
    return this.config;
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<ConfigData>): void {
    if (!this.config) {
      this.loadConfig();
    }
    if (!this.config) {
      throw new Error("Failed to load configuration");
    }
    this.config = {
      ...this.config,
      ...updates,
    };
    this.saveConfig();
  }

  /**
   * Get allowed chat names
   */
  public getAllowedChatNames(): string[] {
    return this.getConfig().allowedChatNames;
  }

  /**
   * Update allowed chat names
   */
  public setAllowedChatNames(chatNames: string[]): void {
    this.updateConfig({ allowedChatNames: chatNames });
  }

  /**
   * Get target group ID
   */
  public getTargetGroupId(): string {
    return this.getConfig().targetGroupId;
  }

  /**
   * Get target group name
   */
  public getTargetGroupName(): string {
    return this.getConfig().targetGroupName;
  }

  /**
   * Update target group configuration
   */
  public setTargetGroup(groupId: string, groupName: string): void {
    this.updateConfig({
      targetGroupId: groupId,
      targetGroupName: groupName,
    });
  }

  /**
   * Set admin password (should be pre-hashed)
   */
  public setAdminPassword(hashedPassword: string): void {
    this.updateConfig({ adminPassword: hashedPassword });
  }

  /**
   * Get admin password hash
   */
  public getAdminPasswordHash(): string {
    return this.getConfig().adminPassword;
  }

  /**
   * Check if admin password is set
   */
  public hasAdminPassword(): boolean {
    const hash = this.getAdminPasswordHash();
    return hash !== null && hash !== undefined && hash !== "";
  }

  /**
   * Get monitor all group chats setting
   */
  public getMonitorAllGroupChats(): boolean {
    return this.getConfig().monitorAllGroupChats || false;
  }

  /**
   * Set monitor all group chats setting
   */
  public setMonitorAllGroupChats(value: boolean): void {
    this.updateConfig({ monitorAllGroupChats: value });
  }

  /**
   * Get focused instructions for LLM
   */
  public getFocusedInstructions(): string {
    return this.getConfig().focusedInstructions || "";
  }

  /**
   * Set focused instructions for LLM
   */
  public setFocusedInstructions(instructions: string): void {
    this.updateConfig({ focusedInstructions: instructions });
  }
}
