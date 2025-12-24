/**
 * Tenant Manager Tests
 * Tests multi-tenant WhatsApp client management
 */

import { TenantManager } from "../tenant-manager";

// Mock modules
jest.mock("@whiskeysockets/baileys");
jest.mock("fs");
jest.mock("qrcode-terminal");
jest.mock("qrcode");

// Mock tenant-config module
jest.mock("../tenant-config", () => {
  return {
    TenantConfigManager: jest.fn().mockImplementation(() => ({
      getTenants: jest.fn().mockReturnValue([]),
      getTenant: jest.fn().mockReturnValue(undefined),
      isMultiTenantMode: jest.fn().mockReturnValue(false),
    })),
  };
});

describe("TenantManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should throw error when no tenants configured", async () => {
      const manager = new TenantManager();

      await expect(manager.initializeAll()).rejects.toThrow(
        "No tenants configured"
      );
    });

    it("should track tenant count", () => {
      const manager = new TenantManager();

      // Initially 0 until initialized
      expect(manager.getTenantCount()).toBe(0);
    });
  });

  describe("Tenant Status", () => {
    it("should return empty status list when no tenants initialized", () => {
      const manager = new TenantManager();
      const statuses = manager.getAllTenantStatuses();

      expect(statuses).toEqual([]);
    });

    it("should check if any tenant is connected", () => {
      const manager = new TenantManager();

      expect(manager.isAnyTenantConnected()).toBe(false);
    });

    it("should check if all tenants have ever connected", () => {
      const manager = new TenantManager();

      expect(manager.haveAllTenantsEverConnected()).toBe(false);
    });
  });

  describe("Tenant Client Retrieval", () => {
    it("should return undefined for non-existent tenant", () => {
      const manager = new TenantManager();
      const client = manager.getTenantClient("non-existent");

      expect(client).toBeUndefined();
    });
  });

  describe("Test Message Processing", () => {
    it("should return null when testing message for non-existent tenant", async () => {
      const manager = new TenantManager();
      const result = await manager.testMessageForTenant(
        "non-existent",
        "test message"
      );

      expect(result).toBeNull();
    });

    it("should return null when testing message with no tenants", async () => {
      const manager = new TenantManager();
      const result = await manager.testMessageForFirstTenant("test message");

      expect(result).toBeNull();
    });
  });

  describe("Lifecycle Management", () => {
    it("should disconnect all tenants", async () => {
      const manager = new TenantManager();

      await expect(manager.disconnectAll()).resolves.not.toThrow();
    });
  });
});
