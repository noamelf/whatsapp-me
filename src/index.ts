import { TenantManager } from "./tenant-manager";
import { HealthServer } from "./health-server";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  try {
    console.log("Starting WhatsApp Event Detection System...");
    console.log("==================================");
    console.log(
      "This system will monitor WhatsApp conversations for event-related discussions"
    );
    console.log(
      "and automatically create calendar entries from detected events."
    );
    console.log("==================================\n");

    // Check if API key is set
    if (!process.env.OPENROUTER_API_KEY) {
      console.error("Error: OPENROUTER_API_KEY is not defined in .env file");
      console.log("Please create a .env file with your OpenRouter API key:");
      console.log("OPENROUTER_API_KEY=your_api_key_here");
      process.exit(1);
    }

    // Initialize Tenant Manager
    const tenantManager = new TenantManager();

    try {
      await tenantManager.initializeAll();
      
      console.log("\nWhatsApp connection(s) established successfully.");
      console.log("Your session(s) have been saved for future use.");
      console.log(
        "The application will now listen for messages and analyze them for events."
      );

      const tenantStatuses = tenantManager.getAllTenantStatuses();
      tenantStatuses.forEach((status) => {
        console.log(
          `  - Tenant ${status.tenantId}: Target group "${status.targetGroupName}"`
        );
      });

      // Start listening for incoming messages on all tenants
      tenantManager.startListeningForAllTenants();

      // Start health check server with test message handler
      const healthPort = parseInt(process.env.PORT || "3000", 10);
      const testEndpointToken = process.env.TEST_ENDPOINT_TOKEN;
      const healthServer = new HealthServer(
        () => ({
          isConnected: tenantManager.isAnyTenantConnected(),
          connectionState: tenantManager.haveAllTenantsEverConnected() ? "open" : "close",
          hasEverConnected: tenantManager.haveAllTenantsEverConnected(),
          tenantStatuses: tenantManager.getAllTenantStatuses(),
        }),
        // Message handler for test endpoint
        async (text, chatName, imageBase64, imageMimeType) => {
          // Use first tenant for test endpoint (backward compatibility)
          const result = await tenantManager.testMessageForFirstTenant(
            text,
            chatName,
            imageBase64,
            imageMimeType
          );
          
          // Return empty result if no tenant available
          if (!result) {
            return {
              hasEvents: false,
              events: [],
            };
          }
          
          return result;
        },
        testEndpointToken
      );
      healthServer.start(healthPort);

      // Keep the application running until user terminates it
      await new Promise(() => {}); // This promise never resolves, keeping the app running
    } catch (error) {
      console.error("Failed to initialize WhatsApp clients:", error);
      console.log("Please check your internet connection and try again.");
      process.exit(1);
    }
  } catch (error) {
    console.error("An unexpected error occurred:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  console.log(
    "Your session(s) have been saved. You can restart the application without scanning the QR code again."
  );

  // Try to gracefully disconnect if we have a tenant manager instance
  try {
    // We would need to pass the tenant manager reference here in a real implementation
    // For now, we'll just exit
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, _promise) => {
  console.error("Unhandled promise rejection:", reason);
  process.exit(1);
});

// Start the application
void main();
