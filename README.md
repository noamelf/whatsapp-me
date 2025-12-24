# WhatsApp Event Detection System

[![CI](https://github.com/noamelf/whatsapp-me/actions/workflows/ci.yml/badge.svg)](https://github.com/noamelf/whatsapp-me/actions/workflows/ci.yml)

This application connects to WhatsApp using the Baileys library, listens for messages, and uses OpenAI to detect events in the messages. When an event is detected, it creates a summary and sends it to a designated WhatsApp group, along with calendar event information that can be added to your calendar.

## Features

- Connect to WhatsApp using QR code authentication (no browser required)
- Reuse existing sessions to avoid repeated QR code scanning
- Listen for all incoming WhatsApp messages in real-time
- Analyze messages using OpenAI to detect events
- **Multi-tenant support** - Run multiple WhatsApp accounts simultaneously in a single deployment
- **Support for multiple events in a single message** - Extract all events when a message contains more than one
- **Photo flood detection** - Automatically skip LLM analysis when receiving many photos without captions to save API tokens
- Extract structured event details (title, date, time, location, description)
- Create summaries of detected events
- Send event summaries to a designated WhatsApp group
- Generate and send calendar event information (.ics format) for easy addition to your calendar
- Display all messages in the console
- Smart date parsing that understands relative dates (like "next Monday" or "tomorrow")
- Support for both English and Hebrew event discussions
- Lightweight and efficient - no browser automation required
- Automatic reconnection handling
- Cross-platform support (Windows, macOS, Linux)

## Prerequisites

- Node.js v18 or higher
- npm or yarn package manager
- An OpenAI API key
- A WhatsApp account
- A WhatsApp group to send event summaries to (configurable via `.env` file)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory (copy from `.env.example`):

   ```
   cp .env.example .env
   ```

   Then configure the following variables:

   **Required:**

   ```
   OPENAI_API_KEY=your_api_key_here
   ```

   **Target Group Configuration (choose one):**

   ```
   # Option 1: Use target group ID directly (recommended if you know it)
   TARGET_GROUP_ID=120363123456789012@g.us

   # Option 2: Use target group name for automatic search
   TARGET_GROUP_NAME=אני
   ```

   - If `TARGET_GROUP_ID` is provided, it will be used directly (faster and more reliable)
   - If only `TARGET_GROUP_NAME` is provided, the bot will search for the group by name
   - If neither is provided, defaults to searching for a group named "אני"

   **Finding your WhatsApp Group ID:**

   - Run the bot once with `TARGET_GROUP_NAME` configured
   - When the bot finds your group, it will log the group ID in the console
   - Copy that ID and use it as `TARGET_GROUP_ID` for better performance

   **Test Endpoint Security (Optional but Recommended):**

   ```
   # Generate a secure token for the /test-message endpoint
   TEST_ENDPOINT_TOKEN=your_secure_token_here
   ```

   - Generate a secure token: `openssl rand -hex 32`
   - If set, the `/test-message` endpoint requires authentication
   - If not set, the endpoint is publicly accessible (not recommended for production)
   - See [TEST_ENDPOINT.md](docs/TEST_ENDPOINT.md) for usage examples

4. (Optional) Add `ALLOWED_CHAT_NAMES` to your `.env` file to filter which chats are analyzed:
   ```
   ALLOWED_CHAT_NAMES=Family Group,Work Team,Book Club
   ```
   - If not set, all chats will be analyzed
   - If set, only messages from chats whose names include any of the specified names will be analyzed
   - Names are case-sensitive and use partial matching (e.g., "Family Group" will match "My Family Group" or "Family Group Chat")
   - Multiple names can be specified by separating them with commas

## Usage

1. Start the application:

   ```
   npm start
   ```

2. If this is your first time running the application, you'll need to scan a QR code to authenticate with WhatsApp:

   - A QR code will be displayed in your terminal
   - Open WhatsApp on your phone
   - Go to Settings > Linked Devices
   - Tap "Link a Device" and scan the QR code

3. After authentication, the application will:

   - Connect to WhatsApp using WebSocket (no browser required)
   - Listen for all WhatsApp messages
   - Analyze messages to detect events
   - Send summaries of detected events to the "אני" WhatsApp group
   - Send calendar event information that can be added to your calendar
   - Display all messages in the console

4. For development with auto-restart:

   ```
   npm run dev
   ```

5. To test event detection without WhatsApp:

   ```bash
   # Set your token (from .env)
   export TEST_TOKEN=your_test_endpoint_token_here

   # Run the test script
   ./test-endpoint.sh

   # Or test against production
   ./test-endpoint.sh https://your-app.railway.app/test-message
   ```

   See [TEST_ENDPOINT.md](TEST_ENDPOINT.md) for detailed API documentation.

## Multi-Tenant Configuration

The application supports running multiple WhatsApp accounts simultaneously in a single deployment. This is useful when you want to monitor different WhatsApp accounts and send events to different target groups.

### Setup

1. Create a `tenants.json` file in the project root (see `tenants.json.example` for reference):

   ```json
   {
     "tenants": [
       {
         "id": "tenant1",
         "targetGroupId": "120363123456789012@g.us",
         "targetGroupName": "Events Group 1",
         "allowedChatNames": ["Family", "Work Team"],
         "sessionDir": ".baileys_auth_tenant1"
       },
       {
         "id": "tenant2",
         "targetGroupId": "120363987654321098@g.us",
         "targetGroupName": "Events Group 2",
         "allowedChatNames": ["Friends", "Book Club"],
         "sessionDir": ".baileys_auth_tenant2"
       }
     ]
   }
   ```

2. Each tenant configuration includes:
   - `id` (required): Unique identifier for the tenant
   - `targetGroupId` (optional): WhatsApp group ID where events will be sent
   - `targetGroupName` (optional): Name of the target group (used for searching if ID not provided)
   - `allowedChatNames` (optional): Array of chat names to monitor (if empty, all chats are monitored)
   - `sessionDir` (optional): Custom directory for storing WhatsApp session data (defaults to `.baileys_auth_{tenantId}`)

3. When `tenants.json` exists, the application will:
   - Ignore environment variable configuration (except `OPENROUTER_API_KEY`)
   - Initialize one WhatsApp client per tenant
   - Each tenant will have its own QR code during first-time setup
   - Sessions are stored separately for each tenant
   - Events from each tenant are sent to their respective target groups

### Multi-Tenant Mode Features

- **Isolated Sessions**: Each tenant has its own WhatsApp session stored in a separate directory
- **Independent Configuration**: Each tenant can monitor different chats and send events to different groups
- **Parallel Processing**: All tenants run simultaneously and process messages independently
- **Health Monitoring**: The `/health` endpoint reports status for all tenants
- **Backward Compatible**: Single-tenant mode still works via environment variables when `tenants.json` doesn't exist

### Example Use Cases

1. **Personal and Work Accounts**: Monitor your personal and work WhatsApp accounts separately, sending events to different calendar groups
2. **Multiple Clients**: Provide event detection service to multiple clients with separate accounts and target groups
3. **Department Separation**: Different departments can have their own WhatsApp monitoring with custom chat filters

### Notes

- Each tenant will need to scan a QR code during initial setup
- Railway volume mount should include all tenant session directories (e.g., `.baileys_auth_*`)
- All tenants share the same OpenRouter API key

## Testing Event Detection

The application includes a REST API endpoint for testing event detection without sending WhatsApp messages:

- **Endpoint:** `POST /test-message`
- **Port:** Same as health check (8080 in production, 3000 locally)
- **Authentication:** Requires `TEST_ENDPOINT_TOKEN` (set in `.env`)
- **Usage:**

  ```bash
  # Using curl with authentication
  curl -X POST http://localhost:8080/test-message \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{"text": "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין"}'

  # Using the test script (easier)
  TEST_TOKEN=your_token ./test-endpoint.sh
  ```

**Features:**

- Test event detection without WhatsApp
- Support for text and base64-encoded images
- Returns structured JSON with detected events
- Token-based security (401 without valid token)
- Ideal for CI/CD integration and automated testing

For complete documentation, examples in multiple languages, and security best practices, see [TEST_ENDPOINT.md](docs/TEST_ENDPOINT.md).
npm install -D checkly

# Set your production URL (override default if needed)

set -x TEST_MESSAGE_URL https://your-app.up.railway.app/test-message

# If your endpoint requires a token

set -x TEST_ENDPOINT_TOKEN your-secret-token

# Preview checks locally from eu-west-1

npx checkly test

# Authenticate and deploy checks to your Checkly account

npx checkly login
npx checkly deploy

```

Notes:

- The check defaults to the example Railway URL from the docs.
- Set `TEST_MESSAGE_URL` and `TEST_ENDPOINT_TOKEN` via Checkly environment variables for production.

## How It Works

1. The application connects to WhatsApp using the `@whiskeysockets/baileys` library via WebSocket.
2. When a message is received, it's displayed in the console and added to a message history for that chat.
3. The message is analyzed using OpenAI's GPT-4o model to determine if it contains information about an event.
4. If an event is detected:
   - OpenAI extracts structured event details (title, date, time, location, description)
   - A summary is created including date, time, location, and purpose
   - The summary is sent to the designated WhatsApp group ("אני")
   - Calendar event information is generated using the extracted details
   - The calendar information is sent to the same group
   - Users can manually add the event to their calendars using the provided information

## Smart Date Handling

The application intelligently handles various date formats:

- Absolute dates (e.g., "12/25/2023", "25.12.2023")
- Day names in English and Hebrew (e.g., "Monday", "יום שני")
- Relative dates (e.g., "tomorrow", "next Friday", "יום ראשון הבא")
- Month names (e.g., "25 December")

When a day of the week is mentioned without "next" (e.g., just "Monday"), the application assumes the upcoming Monday relative to the current date.

## Token Optimization

The application includes intelligent token-saving features to reduce OpenAI API costs:

### Photo Flood Detection

When someone sends multiple photos in quick succession (typically vacation photos, screenshots, etc.), the system automatically detects this pattern and skips LLM analysis:

- **Threshold**: 3 or more image messages within 30 seconds
- **Caption-aware**: If 70% or more of the images lack captions (or have minimal text), they're considered "just photos"
- **Smart filtering**: Images with meaningful captions (likely event invitations or flyers) are still analyzed
- **Automatic cleanup**: Old message timestamps are automatically cleaned up to prevent memory bloat

This feature can save significant API costs when users share photo albums in group chats, while still analyzing images that may contain event information.

## Advantages of Baileys over WhatsApp Web

- **No Browser Required**: Baileys connects directly via WebSocket, eliminating the need for Chromium/Puppeteer
- **Lower Resource Usage**: Uses significantly less RAM and CPU compared to browser automation
- **Better Stability**: More reliable connection with automatic reconnection handling
- **Faster**: Direct WebSocket communication is faster than browser automation
- **Cross-Platform**: Works consistently across different operating systems
- **Session Persistence**: Better session management with multi-file auth state

## Troubleshooting

- If the application fails to connect, make sure your internet connection is stable
- If the target group is not found, check your `TARGET_GROUP_ID` or `TARGET_GROUP_NAME` configuration in the `.env` file
- If OpenAI analysis fails, check your API key and internet connection
- If calendar events don't contain the correct information, the event details might not be clearly specified in the original message
- If authentication fails, delete the `.baileys_auth` folder and restart to get a fresh QR code

## Project Structure

```

src/
├── index.ts # Main application entry point
├── whatsapp-client.ts # Baileys WhatsApp client wrapper
└── openai-service.ts # OpenAI API integration for event detection

```

## Model Guide

See the agent instructions in [docs/SPEC.md](docs/SPEC.md) under "Agent Instructions: Model Guide" for model selection and parameter constraints when modifying `openai-service.ts`.

## Agent Instructions: Railway Deployment

- Builder: Dockerfile (see `railway.toml`); entrypoint `node dist/index.js` after `npm run build`.
- Persistent volume: keep the mount at `/app/.baileys_auth` (stores Baileys auth and `group_cache.json` for metadata caching); do not remove or rename it.
- Required env: `OPENAI_API_KEY`; target group via `TARGET_GROUP_ID` (preferred) or `TARGET_GROUP_NAME`; optional `ALLOWED_CHAT_NAMES` filter.
- Healthcheck: `/health` with 300s timeout is configured in `railway.toml`; ensure the endpoint stays light and available on startup.
- Deploy: `railway up` (or via GitHub trigger) builds with the Dockerfile; inspect runtime issues with `railway logs --service <service>` and confirm the volume mount is present.

## License

MIT
```
