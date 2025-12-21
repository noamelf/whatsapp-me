import { OpenAIService, EventDetails } from "./openai-service";
import dotenv from "dotenv";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config();

function createEventVCalendar(eventDetails: EventDetails): string {
  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `event-${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}@whatsapp-bot`;

  let vcalendar = "BEGIN:VCALENDAR\n";
  vcalendar += "VERSION:2.0\n";
  vcalendar += "PRODID:-//WhatsApp Event Bot//EN\n";
  vcalendar += "BEGIN:VEVENT\n";
  vcalendar += `UID:${uid}\n`;
  vcalendar += `DTSTAMP:${dtstamp}\n`;

  if (eventDetails.startDateISO) {
    const startDate = new Date(eventDetails.startDateISO);
    const dtstart =
      startDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    vcalendar += `DTSTART:${dtstart}\n`;
  }

  if (eventDetails.endDateISO) {
    const endDate = new Date(eventDetails.endDateISO);
    const dtend =
      endDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    vcalendar += `DTEND:${dtend}\n`;
  }

  if (eventDetails.title) {
    vcalendar += `SUMMARY:${eventDetails.title.replace(/\n/g, "\\n")}\n`;
  }

  if (eventDetails.description) {
    vcalendar += `DESCRIPTION:${eventDetails.description.replace(
      /\n/g,
      "\\n"
    )}\n`;
  }

  if (eventDetails.location) {
    vcalendar += `LOCATION:${eventDetails.location.replace(/\n/g, "\\n")}\n`;
  }

  vcalendar += "END:VEVENT\n";
  vcalendar += "END:VCALENDAR";

  return vcalendar;
}

function saveIcsFile(eventDetails: EventDetails, index: number): string {
  const outputDir = path.join(process.cwd(), "test-output");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${(eventDetails.title || "event").replace(
    /[^a-zA-Z0-9א-ת]/g,
    "_"
  )}_${index}_${Date.now()}.ics`;
  const filepath = path.join(outputDir, filename);

  const icsContent = createEventVCalendar(eventDetails);
  fs.writeFileSync(filepath, icsContent, "utf-8");

  return filepath;
}

async function testMessage(message: string): Promise<void> {
  const openaiService = new OpenAIService();

  console.log("\n" + "=".repeat(60));
  console.log("Testing message:");
  console.log(`"${message}"`);
  console.log("=".repeat(60) + "\n");

  const result = await openaiService.analyzeMessage(
    "test-chat-id",
    message,
    "Test Chat", // Chat name - use a name that's in your ALLOWED_CHAT_NAMES or leave ALLOWED_CHAT_NAMES empty
    "Test User"
  );

  if (result.hasEvents && result.events.length > 0) {
    console.log(`✅ Found ${result.events.length} event(s):\n`);

    result.events.forEach((event, index) => {
      console.log(`--- Event ${index + 1} ---`);
      console.log(`  Title:       ${event.title || "N/A"}`);
      console.log(`  Summary:     ${event.summary || "N/A"}`);
      console.log(`  Date:        ${event.date || "N/A"}`);
      console.log(`  Time:        ${event.time || "N/A"}`);
      console.log(`  Location:    ${event.location || "N/A"}`);
      console.log(`  Description: ${event.description || "N/A"}`);
      console.log(`  Start:       ${event.startDateISO || "N/A"}`);
      console.log(`  End:         ${event.endDateISO || "N/A"}`);

      // Save ICS file
      if (event.title && event.startDateISO) {
        const icsPath = saveIcsFile(event, index + 1);
        console.log(`  📄 ICS file: ${icsPath}`);
      }
      console.log("");
    });
  } else {
    console.log("❌ No events detected in this message.");
  }
}

function interactiveMode(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n📅 WhatsApp Event Detection - Test Mode");
  console.log("========================================");
  console.log("Enter messages to test event detection.");
  console.log('Type "exit" or "quit" to stop.\n');

  const askQuestion = (): void => {
    rl.question("Enter message to test: ", async (input) => {
      const trimmedInput = input.trim();

      if (
        trimmedInput.toLowerCase() === "exit" ||
        trimmedInput.toLowerCase() === "quit"
      ) {
        console.log("\nGoodbye! 👋");
        rl.close();
        process.exit(0);
      }

      if (trimmedInput) {
        await testMessage(trimmedInput);
      }

      askQuestion();
    });
  };

  askQuestion();
}

async function main(): Promise<void> {
  // Check if OpenAI API key is set
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not defined in .env file");
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Message provided as command line argument
    const message = args.join(" ");
    await testMessage(message);
  } else {
    // No message provided, run in interactive mode
    await interactiveMode();
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
