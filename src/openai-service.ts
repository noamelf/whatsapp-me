/**
 * Agent Instructions: OpenAI Model Guide
 *
 * Models:
 * - Default: gpt-5-mini (cost-optimized; supports text+image, structured outputs)
 * - Escalation: gpt-5.2 for complex/ambiguous cases; prefer Responses API if using reasoning
 *
 * Parameters:
 * - Use `max_completion_tokens` (not `max_tokens`)
 * - Use `response_format: { type: "json_object" }` for structured output
 * - Do NOT send `temperature`, `top_p`, or `logprobs` to gpt-5-mini (will error)
 * - For gpt-5.2, these are only supported with Responses API when `reasoning.effort = "none"`
 *
 * Vision:
 * - Pass images via messages[].content using an `image_url` item with data URI
 *   (data:<mime>;base64,<payload>) and `detail: "auto"`
 *
 * Output schema:
 * - Must match MultiEventResult with Hebrew fields when content is Hebrew
 * - Convert dates to Israel timezone and ISO; apply defaults when missing
 *
 * Policy:
 * - Start with gpt-5-mini; escalate to gpt-5.2 on repeated parse failures,
 *   multi-event ambiguity, or heavy visual content requiring stronger reasoning
 */
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export interface EventDetails {
  isEvent: boolean;
  summary: string | null;
  title: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  startDateISO: string | null;
  endDateISO: string | null;
}

export interface MultiEventResult {
  hasEvents: boolean;
  events: EventDetails[];
}

export class OpenAIService {
  private openai: OpenAI;
  private messageHistory = new Map<string, string[]>();
  private readonly MAX_HISTORY_LENGTH = 5;
  private readonly allowedChatNames: string[];
  private readonly model: string;

  constructor() {
    // Support both OpenRouter and direct OpenAI
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openRouterKey && !openaiKey) {
      throw new Error("Either OPENROUTER_API_KEY or OPENAI_API_KEY must be defined in .env file");
    }

    // Prefer OpenRouter if key is provided
    if (openRouterKey) {
      this.openai = new OpenAI({
        apiKey: openRouterKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      // Default to cost-effective model via OpenRouter
      this.model = process.env.LLM_MODEL || "google/gemini-2.0-flash-lite-001";
      console.log(`Using OpenRouter with model: ${this.model}`);
    } else {
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });
      this.model = process.env.LLM_MODEL || "gpt-5-mini";
      console.log(`Using OpenAI directly with model: ${this.model}`);
    }

    // Get allowed chat names from environment variable
    const allowedChatNamesStr = process.env.ALLOWED_CHAT_NAMES;
    this.allowedChatNames = allowedChatNamesStr
      ? allowedChatNamesStr.split(",").map((name) => name.trim())
      : [];
  }

  /**
   * Check if a chat name is in the allowed list
   */
  private isChatAllowed(chatName: string): boolean {
    if (this.allowedChatNames.length === 0) {
      return true; // If no names specified, allow all chats
    }
    return this.allowedChatNames.some((name) => chatName.includes(name));
  }

  /**
   * Add a message to the history for a specific chat
   */
  public addMessageToHistory(chatId: string, message: string): void {
    if (!this.messageHistory.has(chatId)) {
      this.messageHistory.set(chatId, []);
    }

    const history = this.messageHistory.get(chatId);
    if (!history) return;
    history.push(message);

    // Keep only the last MAX_HISTORY_LENGTH messages
    if (history.length > this.MAX_HISTORY_LENGTH) {
      this.messageHistory.set(chatId, history.slice(-this.MAX_HISTORY_LENGTH));
    }
  }

  /**
   * Get the message history for a specific chat
   */
  public getMessageHistory(chatId: string): string[] {
    return this.messageHistory.get(chatId) || [];
  }

  /**
   * Analyze a message to detect if it contains one or more events
   */
  public async analyzeMessage(
    chatId: string,
    message: string,
    chatName: string,
    sender?: string,
    imageBase64?: string | null,
    imageMimeType?: string | null
  ): Promise<MultiEventResult> {
    try {
      // Check if the chat is allowed
      if (!this.isChatAllowed(chatName || chatId)) {
        console.log(
          `Skipping analysis for chat ID: "${chatId}" - chat name: "${chatName}" - not in allowed list`
        );
        console.log(`Allowed list:`, JSON.stringify(this.allowedChatNames));
        return {
          hasEvents: false,
          events: [],
        };
      }

      // Get the message history for context
      const history = this.getMessageHistory(chatId);

      // Create the prompt for OpenAI
      const imageNote = imageBase64
        ? "\nNote: An image is attached to this message. Please analyze both the text (if any) and the image content to detect events. The image may contain an event flyer, invitation, poster, or other visual information about an event."
        : "";

      const groupContext = chatName
        ? `\nGroup/Chat Name: "${chatName}" - Use this as context to better understand the nature and purpose of the conversation when analyzing for events.`
        : "";

      const prompt = `
Analyze the following WhatsApp message and determine if it contains information about one or more events (like meetings, parties, gatherings, etc.).${imageNote}${groupContext}
A message can contain MULTIPLE events - make sure to extract ALL of them.
Events usually contain a day reference, like "יום ראשון" or "יום שני" or "יום שלישי" or "יום רביעי" or "יום חמישי" or "יום שישי" or "יום שבת" 
It could also be a specific date. It doesn't have to include all information like location.
If the message only tries to find a good time to meet, it's not an event.

For EACH event detected, extract the following details:
1. Title - A short title for the event (in Hebrew if possible)
2. Date - The date of the event (e.g., "Monday", "יום שני", "Tomorrow", "Next Friday", "12/25/2023")
3. Time - The time of the event (e.g., "3:00 PM", "15:00", "בשעה 18:00")
4. Location - Where the event will take place (in Hebrew if possible)
5. Description - A brief description of the event
6. Start Date ISO - Convert the date and time to ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
7. End Date ISO - Assume the event lasts 1 hour and provide the end time in ISO format

Previous messages for context:
${history.map((msg, i) => `[${i + 1}] ${msg}`).join("\n")}

Current message:
${message}

Sender: ${sender || "Unknown"}

Respond in the following JSON format:
{
  "hasEvents": true/false,
  "events": [
    {
      "isEvent": true,
      "summary": "A brief Hebrew summary of the event (1-2 sentences)",
      "title": "Short event title in Hebrew",
      "date": "Event date in Hebrew (e.g., היום, מחר, יום שני)",
      "time": "Event time (e.g., 12:00)",
      "location": "Event location in Hebrew if mentioned, otherwise null",
      "description": "Brief description of the event in Hebrew (do NOT include the original message)",
      "startDateISO": "YYYY-MM-DDTHH:MM:SS.sssZ",
      "endDateISO": "YYYY-MM-DDTHH:MM:SS.sssZ"
    }
  ]
}

If no events are found, set hasEvents to false and events to an empty array [].
If multiple events are found, include ALL of them in the events array.
For all text fields, use Hebrew.
Keep the description brief and clean - do not repeat the original message text.

For the startDateISO and endDateISO fields:
1. Analyze the date and time from the message relative to the current date: ${new Date().toLocaleDateString(
        "en-US",
        { year: "numeric", month: "long", day: "numeric" }
      )}
2. IMPORTANT: Events are usually in the future. When interpreting relative dates (e.g., "Sunday", "Monday") or ambiguous dates, prefer future dates over past dates. For example, if today is Wednesday and the message mentions "Monday", it most likely refers to next Monday, not last Monday.
3. Assume any date and time mentioned is in Israel timezone
4. If the time is not specified, set the time to 8:00 AM (08:00) and end time to 9:00 AM (09:00)
5. If there is no year mentioned, assume the current year (${new Date().toLocaleDateString(
        "en-US",
        { year: "numeric" }
      )})
6. If there is no month mentioned, assume the current month (${new Date().toLocaleDateString(
        "en-US",
        { month: "long" }
      )})
7. If a time is specified, set the end time to 1 hour after the start time
8. If you can't determine a date, use the current date
9. Convert to ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
`;

      // Build the message content array for the API call
      const userContent: (
        | { type: "text"; text: string }
        | {
            type: "image_url";
            image_url: { url: string; detail?: "low" | "high" | "auto" };
          }
      )[] = [{ type: "text", text: prompt }];

      // Add image if present
      if (imageBase64 && imageMimeType) {
        const mimeType = imageMimeType.startsWith("image/")
          ? imageMimeType
          : "image/jpeg";
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
            detail: "auto",
          },
        });
        console.log("Including image in OpenAI analysis request");
      }

      // Call OpenAI API (via OpenRouter or directly)
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that analyzes WhatsApp messages to detect events and extract structured details. A single message can contain MULTIPLE events - make sure to extract ALL of them. For Hebrew content, provide Hebrew output for summary, title, and location. You are also skilled at converting dates and times to ISO format. IMPORTANT: When interpreting dates, remember that events are usually in the future - prefer future dates over past dates when there is ambiguity. When an image is provided, analyze both the text and the image content to detect events (such as event flyers, invitations, posters, etc.).",
          },
          { role: "user", content: userContent },
        ],
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "";
      const finishReason = response.choices[0]?.finish_reason;

      // Check if response was truncated
      if (finishReason === "length") {
        console.error(
          "⚠️ OpenAI response was truncated due to token limit. Increasing max_completion_tokens may help."
        );
        console.log("Partial response:", content);
      }

      try {
        // Parse the JSON response
        const parsedResponse = JSON.parse(content) as {
          hasEvents?: boolean;
          events?: {
            summary?: string;
            title?: string;
            date?: string;
            time?: string;
            location?: string;
            description?: string;
            startDateISO?: string;
            endDateISO?: string;
          }[];
        };

        const hasEvents = parsedResponse.hasEvents === true;
        const events: EventDetails[] = [];

        if (hasEvents && Array.isArray(parsedResponse.events)) {
          for (const event of parsedResponse.events) {
            events.push({
              isEvent: true,
              summary: event.summary ?? null,
              title: event.title ?? null,
              date: event.date ?? null,
              time: event.time ?? null,
              location: event.location ?? null,
              description: event.description ?? null,
              startDateISO: event.startDateISO ?? null,
              endDateISO: event.endDateISO ?? null,
            });
          }
        }

        return {
          hasEvents,
          events,
        };
      } catch (parseError) {
        console.error("Error parsing OpenAI response:", parseError);
        console.log("Raw response:", content);

        // Fallback to basic parsing if JSON parsing fails
        const hasEvents =
          content.includes('"hasEvents": true') ||
          content.includes('"hasEvents":true');
        const summaryMatch = /"summary":\s*"([^"]*)"/.exec(content);

        if (hasEvents && summaryMatch) {
          return {
            hasEvents: true,
            events: [
              {
                isEvent: true,
                summary: summaryMatch[1],
                title: null,
                date: null,
                time: null,
                location: null,
                description: null,
                startDateISO: null,
                endDateISO: null,
              },
            ],
          };
        }

        return {
          hasEvents: false,
          events: [],
        };
      }
    } catch (error) {
      console.error("Error analyzing message with OpenAI:", error);
      return {
        hasEvents: false,
        events: [],
      };
    }
  }
}
