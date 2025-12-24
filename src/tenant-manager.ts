/**
 * Tenant Manager
 * 
 * Manages multiple WhatsApp clients, one per tenant.
 * Handles lifecycle, initialization, and health status for all tenants.
 */

import { WhatsAppClient } from "./whatsapp-client";
import { TenantConfig, TenantConfigManager } from "./tenant-config";

export interface TenantStatus {
  tenantId: string;
  isConnected: boolean;
  connectionState: string;
  hasEverConnected: boolean;
  targetGroupName: string;
}

export class TenantManager {
  private clients = new Map<string, WhatsAppClient>();
  private configManager: TenantConfigManager;

  constructor() {
    this.configManager = new TenantConfigManager();
  }

  /**
   * Initialize all tenant WhatsApp clients
   */
  public async initializeAll(): Promise<void> {
    const tenants = this.configManager.getTenants();

    if (tenants.length === 0) {
      throw new Error("No tenants configured. Please configure tenants in tenants.json or environment variables.");
    }

    console.log(`\n🚀 Initializing ${tenants.length} tenant(s)...`);
    console.log("==================================\n");

    // Initialize clients sequentially to avoid overwhelming WhatsApp servers
    for (const tenant of tenants) {
      await this.initializeTenant(tenant);
    }

    console.log("\n==================================");
    console.log(`✅ All ${tenants.length} tenant(s) initialized successfully!`);
    console.log("==================================\n");
  }

  /**
   * Initialize a single tenant's WhatsApp client
   */
  private async initializeTenant(tenant: TenantConfig): Promise<void> {
    console.log(`\n📱 Initializing tenant: ${tenant.id}`);
    
    try {
      const client = new WhatsAppClient(tenant);
      
      await client.initialize();
      
      // Store the client
      this.clients.set(tenant.id, client);
      
      console.log(`✅ Tenant ${tenant.id} initialized successfully`);
      console.log(`   Target Group: ${tenant.targetGroupName || tenant.targetGroupId || "Not configured"}`);
      
      // Add a small delay between tenant initializations to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to initialize tenant ${tenant.id}:`, error);
      throw error;
    }
  }

  /**
   * Start listening for messages on all tenant clients
   */
  public startListeningForAllTenants(): void {
    console.log("\n👂 Starting message listeners for all tenants...\n");
    
    for (const [tenantId, client] of this.clients.entries()) {
      console.log(`   Starting listener for tenant: ${tenantId}`);
      client.startListeningForMessages();
    }
    
    console.log("\n✅ All tenant listeners started successfully");
  }

  /**
   * Get status for all tenants
   */
  public getAllTenantStatuses(): TenantStatus[] {
    const statuses: TenantStatus[] = [];

    for (const [tenantId, client] of this.clients.entries()) {
      statuses.push({
        tenantId,
        isConnected: client.isConnected(),
        connectionState: client.getConnectionState(),
        hasEverConnected: client.getHasEverConnected(),
        targetGroupName: client.getTargetGroupName(),
      });
    }

    return statuses;
  }

  /**
   * Get a specific tenant's client
   */
  public getTenantClient(tenantId: string): WhatsAppClient | undefined {
    return this.clients.get(tenantId);
  }

  /**
   * Check if any tenant is connected
   */
  public isAnyTenantConnected(): boolean {
    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all tenants have ever connected (for health check)
   */
  public haveAllTenantsEverConnected(): boolean {
    if (this.clients.size === 0) {
      return false;
    }

    for (const client of this.clients.values()) {
      if (!client.getHasEverConnected()) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get the number of configured tenants
   */
  public getTenantCount(): number {
    return this.clients.size;
  }

  /**
   * Disconnect all tenant clients
   */
  public async disconnectAll(): Promise<void> {
    console.log("\n🔌 Disconnecting all tenants...");
    
    const disconnectPromises: Promise<void>[] = [];
    
    for (const [tenantId, client] of this.clients.entries()) {
      console.log(`   Disconnecting tenant: ${tenantId}`);
      disconnectPromises.push(client.disconnect());
    }
    
    await Promise.all(disconnectPromises);
    this.clients.clear();
    
    console.log("✅ All tenants disconnected");
  }

  /**
   * Test message processing for a specific tenant (for test endpoint)
   */
  public async testMessageForTenant(
    tenantId: string,
    text: string,
    chatName?: string,
    imageBase64?: string | null,
    imageMimeType?: string | null
  ): Promise<{
    hasEvents: boolean;
    events: {
      isEvent: boolean;
      summary: string | null;
      title: string | null;
      date: string | null;
      time: string | null;
      location: string | null;
      description: string | null;
      startDateISO: string | null;
      endDateISO: string | null;
    }[];
    formattedMessages?: string[];
  } | null> {
    const client = this.clients.get(tenantId);
    
    if (!client) {
      console.error(`Tenant ${tenantId} not found`);
      return null;
    }
    
    return await client.testMessage(text, chatName, imageBase64, imageMimeType);
  }

  /**
   * Test message processing for all tenants (for test endpoint without tenant specified)
   * Returns results from the first tenant (backward compatibility with single-tenant mode)
   */
  public async testMessageForFirstTenant(
    text: string,
    chatName?: string,
    imageBase64?: string | null,
    imageMimeType?: string | null
  ): Promise<{
    hasEvents: boolean;
    events: {
      isEvent: boolean;
      summary: string | null;
      title: string | null;
      date: string | null;
      time: string | null;
      location: string | null;
      description: string | null;
      startDateISO: string | null;
      endDateISO: string | null;
    }[];
    formattedMessages?: string[];
  } | null> {
    const firstClient = this.clients.values().next().value as WhatsAppClient | undefined;
    
    if (!firstClient) {
      console.error("No tenants configured");
      return null;
    }
    
    return await firstClient.testMessage(text, chatName, imageBase64, imageMimeType);
  }
}
