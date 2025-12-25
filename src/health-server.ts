import * as http from "http";
import { AdminServer } from "./admin-server";
import { ConfigService } from "./config-service";

interface HealthStatus {
  status: "healthy" | "unhealthy" | "initializing";
  whatsappConnected: boolean;
  connectionState: string;
  uptime: number;
  timestamp: string;
}

type StatusProvider = () => {
  isConnected: boolean;
  connectionState: string;
  hasEverConnected: boolean;
};

type MessageHandler = (
  text: string,
  chatName?: string,
  imageBase64?: string | null,
  imageMimeType?: string | null
) => Promise<{
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
}>;

export class HealthServer {
  private server: http.Server | null = null;
  private startTime: Date;
  private statusProvider: StatusProvider;
  private messageHandler?: MessageHandler;
  private testEndpointToken?: string;
  private adminServer: AdminServer;

  constructor(
    statusProvider: StatusProvider,
    messageHandler?: MessageHandler,
    testEndpointToken?: string,
    configService?: ConfigService,
    chatProvider?: () => Promise<{ id: string; name: string; isGroup: boolean }[]>,
    whatsappStatusProvider?: () => { isConnected: boolean; connectionState: string; qrCode: string | null }
  ) {
    this.startTime = new Date();
    this.statusProvider = statusProvider;
    this.messageHandler = messageHandler;
    this.testEndpointToken = testEndpointToken;
    this.adminServer = new AdminServer(
      configService || new ConfigService(),
      chatProvider,
      whatsappStatusProvider
    );
  }

  public start(port = 3000): void {
    this.server = http.createServer((req, res) => {
      const url = req.url || "";

      // Handle admin routes
      if (url.startsWith("/admin")) {
        this.adminServer.handleRequest(req, res);
        return;
      }

      // Handle GET /health or GET /
      if (req.method === "GET" && (url === "/health" || url === "/")) {
        const status = this.getHealthStatus();
        // Return 200 during setup (before first connection), 503 if disconnected after setup
        const statusCode = status.status === "unhealthy" ? 503 : 200;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status, null, 2));
      }
      // Handle POST /test-message
      else if (req.method === "POST" && url === "/test-message") {
        void this.handleTestMessage(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`Health check server running on port ${port}`);
      console.log(`Endpoints: GET / or GET /health, POST /test-message, GET /admin`);
    });

    this.server.on("error", (error) => {
      console.error("Health server error:", error);
    });
  }

  private handleTestMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    // Check for authorization token if configured
    if (this.testEndpointToken) {
      const authHeader =
        req.headers["authorization"] || req.headers["x-api-key"];
      const providedToken = String(authHeader ?? "")
        .replace(/^Bearer /i, "")
        .trim();

      if (!providedToken || providedToken !== this.testEndpointToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            { error: "Unauthorized - Invalid or missing API token" },
            null,
            2
          )
        );
        return;
      }
    }

    if (!this.messageHandler) {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "Message handler not configured" }, null, 2)
      );
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body) as {
          text: string;
          chatName?: string;
          imageBase64?: string;
          imageMimeType?: string;
        };

        if (!payload.text || typeof payload.text !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify(
              { error: "Missing or invalid 'text' field in request body" },
              null,
              2
            )
          );
          return;
        }

        console.log(
          `\n[TEST MESSAGE] Received from "${
            payload.chatName || "Test Chat"
          }": ${payload.text.substring(0, 100)}...`
        );

        if (!this.messageHandler) {
          res.writeHead(501, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Message handler not configured" }, null, 2)
          );
          return;
        }

        const result = await this.messageHandler(
          payload.text,
          payload.chatName,
          payload.imageBase64 || null,
          payload.imageMimeType || null
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error("Error handling test message:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            {
              error: "Internal server error",
              details: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          )
        );
      }
    });

    req.on("error", (error) => {
      console.error("Request error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request error" }, null, 2));
    });
  }

  private getHealthStatus(): HealthStatus {
    const { isConnected, connectionState, hasEverConnected } =
      this.statusProvider();
    const uptimeMs = Date.now() - this.startTime.getTime();

    // Determine status:
    // - "initializing" = never connected yet (waiting for QR scan) -> 200
    // - "healthy" = currently connected -> 200
    // - "unhealthy" = was connected but now disconnected -> 503
    let status: "healthy" | "unhealthy" | "initializing";
    if (isConnected) {
      status = "healthy";
    } else if (hasEverConnected) {
      status = "unhealthy";
    } else {
      status = "initializing";
    }

    return {
      status,
      whatsappConnected: isConnected,
      connectionState,
      uptime: Math.floor(uptimeMs / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
