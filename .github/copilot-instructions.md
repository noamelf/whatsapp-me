---
applyTo: "."
---

# WhatsApp Event Detection System - Development Instructions

## Project Overview

WhatsApp Event Detection System: A service that monitors WhatsApp conversations, detects event-related discussions, and automatically converts them into actionable calendar entries with proper event details (title, date, time, location, description).

## Core Architecture & Technologies

### Main Components

- **WhatsApp Client**: Uses Baileys library for WebSocket-based WhatsApp connection (no browser automation)
- **OpenAI Service**: Analyzes messages using GPT models to detect and extract event information
- **Message Processor**: Listens for all incoming messages, filters by chat names if configured
- **Calendar Event Generator**: Creates calendar entries and sends them to designated WhatsApp groups

### Key Files

- `whatsapp-client.ts`: Baileys integration, session persistence, QR code authentication
- `openai-service.ts`: OpenAI API integration for event detection and extraction
- `index.ts`: Main application entry point and message listening loop
- `health-server.ts`: Health check endpoint for deployment monitoring

### Tech Stack

- **Runtime**: Node.js v18+
- **Language**: TypeScript
- **WhatsApp Integration**: Baileys library
- **AI/ML**: OpenAI API (Chat Completions)
- **Calendar Format**: iCalendar (.ics format)
- **Deployment**: Docker, Railway

## Key Features & Requirements

### Message Analysis Capabilities

- **Multi-Language Support**: Process event discussions in English and Hebrew
- **Multiple Events**: Extract multiple events from single messages
- **Context Awareness**: Understand conversation history and context
- **Smart Date Parsing**: Handle relative dates (tomorrow, next Monday), absolute dates, and Hebrew date expressions
- **Event Extraction**: Pull title, date, time, location, description from natural conversations
- **False Positive Prevention**: Distinguish between event planning and casual conversation

### WhatsApp Configuration

- **Authentication**: QR code scan on first run, then session persistence (no repeated QR codes)
- **Session Reuse**: Store sessions locally to avoid re-authentication
- **Chat Filtering**: Optional `ALLOWED_CHAT_NAMES` config to filter which chats to monitor
- **Target Group**: Configure via `TARGET_GROUP_ID` (recommended) or `TARGET_GROUP_NAME`
- **Cross-Platform**: Windows, macOS, Linux support

### Configuration Environment Variables

- **Required**: `OPENAI_API_KEY` (OpenAI API credentials)
- **Target Group**: Either `TARGET_GROUP_ID=120363...@g.us` OR `TARGET_GROUP_NAME=GroupName`
- **Optional**: `ALLOWED_CHAT_NAMES=Chat1,Chat2,Chat3` (comma-separated, case-sensitive, partial match)

### Event Output Schema

Events extracted must conform to:

```
{
  "hasEvents": boolean,
  "events": [
    {
      "isEvent": boolean,
      "summary": string|null,  // Hebrew for Hebrew content
      "title": string|null,    // Hebrew for Hebrew content
      "date": string|null,
      "time": string|null,
      "location": string|null,
      "description": string|null,  // Keep concise, no raw text duplication
      "startDateISO": string|null, // ISO 8601 format
      "endDateISO": string|null    // ISO 8601 format
    }
  ]
}
```

## OpenAI Integration Guidelines

### Model Selection

- **gpt-4o (primary)** or **gpt-4o-mini**: Recommended for balanced cost/accuracy
- **gpt-4-turbo**: For complex/ambiguous messages with multiple events
- **gpt-4**: For simple classification or when cost is critical

### API Requirements

- **Output Format**: Use `response_format: { type: "json_object" }` for structured JSON
- **Max Tokens**: Use `max_completion_tokens` parameter (not `max_tokens`)
- **Temperature**: Only use when explicitly needed, avoid for structured outputs
- **Vision Support**: Can include images via data URIs in message content

### Prompting Rules

- Provide Hebrew outputs (`summary`, `title`, `location`, descriptions) when content is Hebrew
- Request `startDateISO` and `endDateISO` in ISO 8601 format for calendar compatibility
- Keep `description` field concise; don't repeat raw message text
- Explicitly ask for `isEvent` classification to minimize false positives

## Development Guidelines

### Code Patterns

- **Error Handling**: Graceful degradation when WhatsApp or OpenAI services are unavailable
- **Logging**: Log message processing, event detection, and API calls for debugging
- **Session Management**: Persist WhatsApp sessions to `auth_info` directory
- **Async/Await**: Use async patterns for WhatsApp message listeners and API calls
- **Type Safety**: Use TypeScript interfaces for event data and API responses

### Testing

- Use `test-message.ts` for testing event detection without live WhatsApp connection
- Test with both English and Hebrew content
- Verify multi-event extraction with complex messages
- Test relative date parsing (tomorrow, next week, etc.)

### Deployment Considerations

- Health check endpoint on configurable port (default 3000)
- Automatic reconnection handling for WhatsApp
- Environment-based configuration (.env file)
- Docker support with proper signal handling for graceful shutdown
- Railway.toml configuration for deployment pipeline

## Common Implementation Tasks

### Adding New Event Fields

1. Update OpenAI prompt to extract the new field
2. Extend the event interface/schema
3. Update event summary generation
4. Test with sample messages

### Improving Event Detection Accuracy

1. Review false positives in logs
2. Refine OpenAI prompts to better distinguish events from casual conversation
3. Add more specific context to prompts (locale, conversation topic)
4. Test with diverse message samples

### Debugging WhatsApp Issues

1. Check `auth_info` directory for session persistence
2. Review WhatsApp logs for connection status
3. Test with `test-message.ts` to isolate OpenAI issues
4. Verify chat filtering logic with console output

## Important Constraints & Edge Cases

- **No Browser Automation**: Baileys uses WebSocket, not browser-based automation
- **Date Ambiguity**: Handle cases where date is unclear or missing (use context or defaults)
- **Rate Limiting**: OpenAI API has rate limits; batch processing may be needed at scale
- **Language Mixing**: Support messages with mixed English/Hebrew content
- **Group Privacy**: Ensure only intended groups receive event notifications
- **Message Types**: Handle text, images, and document sharing (focus on text content)
