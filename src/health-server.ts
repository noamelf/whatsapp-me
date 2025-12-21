import * as http from "http";

interface HealthStatus {
  status: "healthy" | "unhealthy";
  whatsappConnected: boolean;
  connectionState: string;
  uptime: number;
  timestamp: string;
}

type StatusProvider = () => { isConnected: boolean; connectionState: string };

export class HealthServer {
  private server: http.Server | null = null;
  private startTime: Date;
  private statusProvider: StatusProvider;

  constructor(statusProvider: StatusProvider) {
    this.startTime = new Date();
    this.statusProvider = statusProvider;
  }

  public start(port: number = 3000): void {
    this.server = http.createServer((req, res) => {
      // Only respond to GET /health or GET /
      if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
        const status = this.getHealthStatus();
        // Always return 200 so Railway doesn't kill the process during QR code scanning
        // The status field indicates the actual WhatsApp connection state
        res.writeHead(200, { "Content-Type": "application/json" });
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
    const { isConnected, connectionState } = this.statusProvider();
    const uptimeMs = Date.now() - this.startTime.getTime();

    return {
      status: isConnected ? "healthy" : "unhealthy",
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
