import * as http from "http";

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

export class HealthServer {
  private server: http.Server | null = null;
  private startTime: Date;
  private statusProvider: StatusProvider;

  constructor(statusProvider: StatusProvider) {
    this.startTime = new Date();
    this.statusProvider = statusProvider;
  }

  public start(port = 3000): void {
    this.server = http.createServer((req, res) => {
      // Only respond to GET /health or GET /
      if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
        const status = this.getHealthStatus();
        // Return 200 during setup (before first connection), 503 if disconnected after setup
        const statusCode = status.status === "unhealthy" ? 503 : 200;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status, null, 2));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    this.server.listen(port, "0.0.0.0", () => {
      console.log(`Health check server running on port ${port}`);
      console.log(`Endpoints: GET / or GET /health`);
    });

    this.server.on("error", (error) => {
      console.error("Health server error:", error);
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
