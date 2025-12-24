/**
 * Multi-Tenant Configuration Tests
 * Tests tenant configuration manager and multi-tenant setup
 */

import { TenantConfigManager } from "../tenant-config";
import * as fs from "fs";

// Mock fs module
jest.mock("fs");

describe("TenantConfigManager", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Environment Variable Configuration (Single Tenant Mode)", () => {
    it("should load configuration from environment variables when tenants.json does not exist", () => {
      // Mock fs.existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.TARGET_GROUP_ID = "123456789@g.us";
      process.env.TARGET_GROUP_NAME = "Test Group";
      process.env.ALLOWED_CHAT_NAMES = "Chat1,Chat2,Chat3";

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0].id).toBe("default");
      expect(tenants[0].targetGroupId).toBe("123456789@g.us");
      expect(tenants[0].targetGroupName).toBe("Test Group");
      expect(tenants[0].allowedChatNames).toEqual(["Chat1", "Chat2", "Chat3"]);
    });

    it("should use default target group name when not specified", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      process.env.OPENROUTER_API_KEY = "test-key";
      delete process.env.TARGET_GROUP_ID;
      delete process.env.TARGET_GROUP_NAME;

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0].targetGroupName).toBe("אני");
    });

    it("should not create tenant if OPENROUTER_API_KEY is not set", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      delete process.env.OPENROUTER_API_KEY;

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(0);
    });
  });

  describe("File-Based Configuration (Multi-Tenant Mode)", () => {
    it("should load configuration from tenants.json when file exists", () => {
      const mockConfig = {
        tenants: [
          {
            id: "tenant1",
            targetGroupId: "111111111@g.us",
            targetGroupName: "Group 1",
            allowedChatNames: ["Chat A"],
            sessionDir: ".baileys_auth_tenant1",
          },
          {
            id: "tenant2",
            targetGroupId: "222222222@g.us",
            targetGroupName: "Group 2",
            allowedChatNames: ["Chat B"],
            sessionDir: ".baileys_auth_tenant2",
          },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig)
      );

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(2);
      expect(tenants[0].id).toBe("tenant1");
      expect(tenants[0].targetGroupId).toBe("111111111@g.us");
      expect(tenants[1].id).toBe("tenant2");
      expect(tenants[1].targetGroupId).toBe("222222222@g.us");
    });

    it("should set default session directory if not provided", () => {
      const mockConfig = {
        tenants: [
          {
            id: "tenant1",
            targetGroupId: "111111111@g.us",
          },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig)
      );

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants[0].sessionDir).toBe(".baileys_auth_tenant1");
    });

    it("should skip tenants without id", () => {
      const mockConfig = {
        tenants: [
          {
            targetGroupId: "111111111@g.us",
          },
          {
            id: "tenant2",
            targetGroupId: "222222222@g.us",
          },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig)
      );

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0].id).toBe("tenant2");
    });

    it("should fallback to environment variables if tenants.json is invalid", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue("invalid json");

      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.TARGET_GROUP_ID = "123456789@g.us";

      const manager = new TenantConfigManager();
      const tenants = manager.getTenants();

      expect(tenants).toHaveLength(1);
      expect(tenants[0].id).toBe("default");
    });
  });

  describe("Tenant Retrieval", () => {
    it("should get specific tenant by id", () => {
      const mockConfig = {
        tenants: [
          {
            id: "tenant1",
            targetGroupId: "111111111@g.us",
          },
          {
            id: "tenant2",
            targetGroupId: "222222222@g.us",
          },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig)
      );

      const manager = new TenantConfigManager();
      const tenant = manager.getTenant("tenant2");

      expect(tenant).toBeDefined();
      expect(tenant?.id).toBe("tenant2");
      expect(tenant?.targetGroupId).toBe("222222222@g.us");
    });

    it("should return undefined for non-existent tenant", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      process.env.OPENROUTER_API_KEY = "test-key";

      const manager = new TenantConfigManager();
      const tenant = manager.getTenant("non-existent");

      expect(tenant).toBeUndefined();
    });
  });

  describe("Multi-Tenant Mode Detection", () => {
    it("should detect multi-tenant mode when multiple tenants configured", () => {
      const mockConfig = {
        tenants: [
          { id: "tenant1", targetGroupId: "111111111@g.us" },
          { id: "tenant2", targetGroupId: "222222222@g.us" },
        ],
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(mockConfig)
      );

      const manager = new TenantConfigManager();

      expect(manager.isMultiTenantMode()).toBe(true);
    });

    it("should not be in multi-tenant mode with single tenant", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      process.env.OPENROUTER_API_KEY = "test-key";

      const manager = new TenantConfigManager();

      expect(manager.isMultiTenantMode()).toBe(false);
    });
  });
});
