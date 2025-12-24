/**
 * Tenant Configuration Module
 * 
 * Manages multi-tenant configuration for the WhatsApp Event Detection System.
 * Supports both environment variable configuration (for single tenant backward compatibility)
 * and JSON file configuration (for multiple tenants).
 */

import * as fs from "fs";
import * as path from "path";

export interface TenantConfig {
  /** Unique identifier for the tenant */
  id: string;
  /** Target WhatsApp group ID (recommended) */
  targetGroupId?: string;
  /** Target WhatsApp group name (for automatic search if ID not provided) */
  targetGroupName?: string;
  /** Optional list of allowed chat names to monitor (if empty, all chats are monitored) */
  allowedChatNames?: string[];
  /** Custom session directory for this tenant (optional, defaults to .baileys_auth_{tenantId}) */
  sessionDir?: string;
}

export class TenantConfigManager {
  private tenants: TenantConfig[] = [];

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Load tenant configuration from environment variables or tenants.json file
   */
  private loadConfiguration(): void {
    // Try to load from tenants.json first
    const configPath = path.join(process.cwd(), "tenants.json");
    
    if (fs.existsSync(configPath)) {
      this.loadFromFile(configPath);
    } else {
      // Fallback to environment variables (single tenant mode for backward compatibility)
      this.loadFromEnvironment();
    }

    if (this.tenants.length === 0) {
      console.warn("⚠️ No tenants configured. The application will not process any messages.");
    } else {
      console.log(`✅ Loaded ${this.tenants.length} tenant(s)`);
      this.tenants.forEach((tenant) => {
        console.log(`  - Tenant: ${tenant.id}`);
        if (tenant.targetGroupId) {
          console.log(`    Target Group ID: ${tenant.targetGroupId}`);
        }
        if (tenant.targetGroupName) {
          console.log(`    Target Group Name: ${tenant.targetGroupName}`);
        }
        if (tenant.allowedChatNames && tenant.allowedChatNames.length > 0) {
          console.log(`    Allowed Chats: ${tenant.allowedChatNames.join(", ")}`);
        }
      });
    }
  }

  /**
   * Load configuration from tenants.json file
   */
  private loadFromFile(configPath: string): void {
    try {
      const fileContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(fileContent) as { tenants: TenantConfig[] };

      if (!config.tenants || !Array.isArray(config.tenants)) {
        throw new Error("Invalid tenants.json format: 'tenants' array not found");
      }

      // Validate and add each tenant
      for (const tenant of config.tenants) {
        if (!tenant.id) {
          console.error("❌ Tenant configuration missing required 'id' field, skipping");
          continue;
        }

        // Set default session directory if not provided
        if (!tenant.sessionDir) {
          tenant.sessionDir = `.baileys_auth_${tenant.id}`;
        }

        // Set default target group name if neither ID nor name provided
        if (!tenant.targetGroupId && !tenant.targetGroupName) {
          tenant.targetGroupName = "אני"; // Default to Hebrew "me"
          console.warn(`⚠️ Tenant ${tenant.id}: No target group configured, using default "${tenant.targetGroupName}"`);
        }

        this.tenants.push(tenant);
      }

      console.log(`📁 Loaded tenant configuration from ${configPath}`);
    } catch (error) {
      console.error(`❌ Error loading tenants.json: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw - fall back to environment variables
      this.loadFromEnvironment();
    }
  }

  /**
   * Load configuration from environment variables (single tenant mode)
   */
  private loadFromEnvironment(): void {
    const targetGroupId = process.env.TARGET_GROUP_ID?.trim();
    const targetGroupName = process.env.TARGET_GROUP_NAME?.trim() || "אני";
    const allowedChatNamesStr = process.env.ALLOWED_CHAT_NAMES?.trim();

    // Only create a tenant if we have at least one API key configured
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn("⚠️ No OPENROUTER_API_KEY configured, skipping environment tenant");
      return;
    }

    const tenant: TenantConfig = {
      id: "default",
      targetGroupId: targetGroupId || undefined,
      targetGroupName: targetGroupName || undefined,
      sessionDir: process.env.BAILEYS_AUTH_DIR || ".baileys_auth",
    };

    // Parse allowed chat names if provided
    if (allowedChatNamesStr) {
      tenant.allowedChatNames = allowedChatNamesStr
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);
    }

    this.tenants.push(tenant);
    console.log("🔧 Loaded tenant configuration from environment variables (single tenant mode)");
  }

  /**
   * Get all configured tenants
   */
  public getTenants(): TenantConfig[] {
    return [...this.tenants];
  }

  /**
   * Get a specific tenant by ID
   */
  public getTenant(id: string): TenantConfig | undefined {
    return this.tenants.find((t) => t.id === id);
  }

  /**
   * Check if multi-tenant mode is enabled
   */
  public isMultiTenantMode(): boolean {
    return this.tenants.length > 1;
  }
}
