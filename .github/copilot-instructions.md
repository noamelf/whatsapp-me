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
- **Group Context**: Pass the group/chat name to OpenAI for better event detection accuracy and context understanding
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

- **gpt-5-mini**: Cost-optimized default; supports text+image and structured outputs.
- **gpt-5.2**: Use for complex/ambiguous messages or multi-event reasoning; prefer Responses API when leveraging reasoning features.
- **gpt-5.2-pro**: Use sparingly for very tough cases requiring deeper reasoning at higher cost.
- **gpt-5-nano**: High-throughput simple tasks; consider only for lightweight classification/pre-filtering.

### API Constraints

- Always use `response_format: { type: "json_object" }` and `max_completion_tokens` (not `max_tokens`).
- Do not send `temperature`, `top_p`, or `logprobs` to `gpt-5-mini`. For `gpt-5.2`, these are only supported with Responses API when `reasoning.effort = "none"`; avoid otherwise. Keep temperature low/omitted for structured outputs.
- Vision: include images via `messages[].content` with an `image_url` item using `data:<mime>;base64,<payload>` and `detail: "auto"`.
- Model reference: https://platform.openai.com/docs/models for updates on available models and parameters.

### Prompting Rules

- Provide Hebrew outputs (`summary`, `title`, `location`, descriptions) when content is Hebrew
- Include group/chat name in prompts for better context understanding (helps AI determine conversation purpose and reduce false positives)
- Request `startDateISO` and `endDateISO` in ISO 8601 format for calendar compatibility
- Keep `description` field concise; don't repeat raw message text
- Explicitly ask for `isEvent` classification to minimize false positives

## Development Guidelines

### Code Patterns

- **Error Handling**: Graceful degradation when WhatsApp or OpenAI services are unavailable
- **Logging**: Log message processing, event detection, and API calls for debugging
- **Session Management**: Persist WhatsApp sessions to `.baileys_auth` directory
- **Async/Await**: Use async patterns for WhatsApp message listeners and API calls
- **Type Safety**: Use TypeScript interfaces for event data and API responses
- **Linting**: Always run `npm run lint` before committing to catch type errors and code quality issues

### Code Quality

- **Before every commit**, run build, linter, and tests:
  ```bash
  npm run build && npm run lint && npm test
  ```
- Fix all linter errors - the build will fail in CI if linting fails
- Fix all failing tests before committing
- Use `npm run lint:fix` to automatically fix fixable lint issues
- Follow ESLint rules configured in `eslint.config.mjs`:
  - No unused variables
  - No floating promises (always await or handle with `.catch()`)
  - No unsafe `any` usage
  - No unreachable code
  - Prefer `T[]` over `Array<T>` for array types

### Testing

- **Local Testing**: Use `test-message.ts` for testing event detection without live WhatsApp connection
- **End-to-End Testing**: Use Checkly to test the deployed endpoint with `npm run checkly:test`
- **Manual API Testing**: Test the Railway deployment directly with curl:
  ```bash
  curl -X POST https://whatsapp-me-production-1204.up.railway.app/test-message \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_ENDPOINT_TOKEN" \
    -d '{"text": "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין"}'
  ```
  This returns the JSON response with detected events from the OpenAI analysis
- **Test Coverage**: Test with both English and Hebrew content
- **Multi-Event Testing**: Verify multi-event extraction with complex messages
- **Date Parsing**: Test relative date parsing (tomorrow, next week, etc.)
- **Deployment Verification**: After pushing changes, run Checkly tests to verify the deployment is working

### Deployment Workflow

- **Automatic Deployment**: Railway automatically deploys when changes are pushed to the `main` branch on GitHub
- **Deployment Process**:
  1. Run lint and tests: `npm run lint && npm test`
  2. Fix any errors before proceeding
  3. Commit changes: `git add -A && git commit -m "your message"`
  4. Push to GitHub: `git push origin main`
  5. Railway automatically detects the push and starts deployment
  6. Check deployment success via Railway MCP
  7. Verify with Checkly: `npm run checkly:test`
- **Health Check**: Railway uses `/health` endpoint for deployment health checks (configured in railway.toml)
- **Environment Variables**: Set in Railway dashboard (OPENAI_API_KEY, TEST_ENDPOINT_TOKEN, etc.)
- **Session Persistence**: WhatsApp sessions are stored in Railway volume mount at `/app/.baileys_auth`

### Deployment Considerations

- Health check endpoint on configurable port (default 3000)
- Automatic reconnection handling for WhatsApp
- Environment-based configuration (.env file for local, Railway dashboard for production)
- Docker support with proper signal handling for graceful shutdown
- Railway.toml configuration for deployment pipeline
- Volume mount for persistent WhatsApp authentication sessions

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

1. Check `.baileys_auth` directory for session persistence
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
