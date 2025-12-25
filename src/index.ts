import { WhatsAppClient } from "./whatsapp-client";
import { HttpServer } from "./http-server";
import { ConfigService } from "./config-service";
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

    // Initialize configuration service
    const configService = new ConfigService();

    // Initialize WhatsApp client with config service
    const whatsappClient = new WhatsAppClient(configService);

    try {
      await whatsappClient.initialize();
      console.log("WhatsApp client initialized successfully!");

      // Add a delay after initialization to ensure WhatsApp is fully loaded
      console.log("Waiting for WhatsApp to fully load before proceeding...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      console.log("\nWhatsApp connection established successfully.");
      console.log("Your session has been saved for future use.");
      console.log(
        "The application will now listen for messages and analyze them for events."
      );
      console.log(
        `Event summaries will be sent to the "${whatsappClient.getTargetGroupName()}" WhatsApp group.`
      );

      // Start listening for incoming messages
      whatsappClient.startListeningForMessages();

      // Start HTTP server with test message handler, admin interface, and health endpoint
      const httpPort = parseInt(process.env.PORT || "3000", 10);
      const testEndpointToken = process.env.TEST_ENDPOINT_TOKEN;
      const httpServer = new HttpServer(
        () => ({
          isConnected: whatsappClient.isConnected(),
          connectionState: whatsappClient.getConnectionState(),
          hasEverConnected: whatsappClient.getHasEverConnected(),
        }),
        // Message handler for test endpoint
        async (text, chatName, imageBase64, imageMimeType) => {
          return await whatsappClient.testMessage(
            text,
            chatName,
            imageBase64,
            imageMimeType
          );
        },
        testEndpointToken,
        configService,
        // Chat provider for admin interface
        async () => {
          return await whatsappClient.getAllChats();
        },
        // WhatsApp status provider for admin interface (QR code, connection state)
        () => ({
          isConnected: whatsappClient.isConnected(),
          connectionState: whatsappClient.getConnectionState(),
          qrCode: whatsappClient.getLatestQRCode(),
        })
      );
      httpServer.start(httpPort);
      
      console.log(`\n🔐 Admin interface available at: http://localhost:${httpPort}/admin`);
      console.log("Use this interface to manage monitored chats and output configuration.");

      // Keep the application running until user terminates it
      await new Promise(() => {}); // This promise never resolves, keeping the app running
    } catch (error) {
      console.error("Failed to initialize WhatsApp client:", error);
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
    "Your session has been saved. You can restart the application without scanning the QR code again."
  );

  // Try to gracefully disconnect if we have a client instance
  try {
    // We would need to pass the client reference here in a real implementation
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
