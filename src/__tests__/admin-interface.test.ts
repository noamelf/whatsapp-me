/**
 * Integration test for admin interface
 * Run with: npm run test:admin
 */

import { ConfigService } from "../config-service";
import { AdminServer } from "../admin-server";
import * as http from "http";
import * as fs from "fs";

describe("Admin Interface Integration", () => {
  let configService: ConfigService;
  let adminServer: AdminServer;
  const testDir = ".baileys_auth_test_admin";

  beforeAll(() => {
    configService = new ConfigService(testDir);
    adminServer = new AdminServer(configService);
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should serve admin HTML page", async () => {
    const req = {
      method: "GET",
      url: "/admin",
      headers: {},
      on: jest.fn(),
    } as unknown as http.IncomingMessage;

    let responseData = "";
    let statusCode = 0;
    const res = {
      writeHead: jest.fn((code: number) => {
        statusCode = code;
      }),
      end: jest.fn((data: string) => {
        responseData = data;
      }),
    } as unknown as http.ServerResponse;

    await adminServer.handleRequest(req, res);

    expect(statusCode).toBe(200);
    expect(responseData).toContain("WhatsApp Bot Admin");
    expect(responseData).toContain("Login");
    expect(responseData).toContain("Monitored Chats");
  });

  it("should handle login with first-time password", (done) => {
    const req = {
      method: "POST",
      url: "/admin/login",
      headers: {},
      on: jest.fn((event: string, callback: (data?: Buffer) => void) => {
        if (event === "data") {
          callback(Buffer.from(JSON.stringify({ password: "testpass123" })));
        } else if (event === "end") {
          setTimeout(() => callback(), 0);
        }
      }),
    } as unknown as http.IncomingMessage;

    let statusCode = 0;
    let responseData = "";
    const res = {
      writeHead: jest.fn((code: number) => {
        statusCode = code;
      }),
      end: jest.fn((data: string) => {
        responseData = data;
        expect(statusCode).toBe(200);
        const response = JSON.parse(responseData) as { token?: string; expiresIn?: number };
        expect(response).toHaveProperty("token");
        expect(response).toHaveProperty("expiresIn");
        done();
      }),
    } as unknown as http.ServerResponse;

    adminServer.handleRequest(req, res);
  });

  it("should require authentication for config endpoints", async () => {
    const req = {
      method: "GET",
      url: "/admin/config",
      headers: {},
      on: jest.fn(),
    } as unknown as http.IncomingMessage;

    let statusCode = 0;
    let responseData = "";
    const res = {
      writeHead: jest.fn((code: number) => {
        statusCode = code;
      }),
      end: jest.fn((data: string) => {
        responseData = data;
      }),
    } as unknown as http.ServerResponse;

    await adminServer.handleRequest(req, res);

    expect(statusCode).toBe(401);
    const response = JSON.parse(responseData) as { error?: string };
    expect(response).toHaveProperty("error");
    expect(response.error).toContain("Unauthorized");
  });
});
