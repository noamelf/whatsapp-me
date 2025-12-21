# Test Message Endpoint

## Overview

The `/test-message` endpoint allows you to test event detection without sending messages through WhatsApp. This is useful for development, testing, and automation.

## Endpoint Details

- **URL:** `POST /test-message`
- **Content-Type:** `application/json`
- **Port:** Same as health check server (default: 8080 in production, 3000 locally)
- **Authentication:** Required if `TEST_ENDPOINT_TOKEN` environment variable is set

## Authentication

If the `TEST_ENDPOINT_TOKEN` environment variable is configured, all requests to `/test-message` must include the token in one of these headers:

- `Authorization: Bearer YOUR_TOKEN`
- `X-API-Key: YOUR_TOKEN`

Without a valid token, requests will receive a `401 Unauthorized` response.

## Request Format

```json
{
  "text": "Your message text here",
  "imageBase64": "optional base64 encoded image data",
  "imageMimeType": "optional, e.g., image/jpeg"
}
```

### Required Fields

- `text` (string): The message text to analyze for events

### Optional Fields

- `imageBase64` (string): Base64-encoded image data
- `imageMimeType` (string): MIME type of the image (e.g., "image/jpeg", "image/png")

## Response Format

```json
{
  "hasEvents": true,
  "events": [
    {
      "isEvent": true,
      "summary": "יום יצירה - פעילות משותפת",
      "title": "יום יצירה",
      "date": "22/12",
      "time": "08:00",
      "location": null,
      "description": "פעילות משותפת לכיתות א-ד",
      "startDateISO": "2025-12-22T08:00:00.000Z",
      "endDateISO": "2025-12-22T09:00:00.000Z"
    }
  ]
}
```

## Example Usage

### Using curl (simple text)

```bash
# Without authentication (if TEST_ENDPOINT_TOKEN not set)
curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין"
  }'

# With authentication (if TEST_ENDPOINT_TOKEN is set)
curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN" \
  -d '{
    "text": "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין"
  }'
```

### Using the test script

```bash
./test-endpoint.sh
```

For production:

```bash
./test-endpoint.sh https://your-railway-app.up.railway.app/test-message
```

### Using curl with image

```bash
# First, encode your image
IMAGE_BASE64=$(base64 -w 0 event-flyer.jpg)

curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -d "{
    \"text\": \"Check out this event!\",
    \"imageBase64\": \"$IMAGE_BASE64\",
    \"imageMimeType\": \"image/jpeg\"
  }"
```

### Using JavaScript/Node.js

```javascript
const response = await fetch("http://localhost:8080/test-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.TEST_ENDPOINT_TOKEN}`,
  },
  body: JSON.stringify({
    text: "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין",
  }),
});

const result = await response.json();
console.log("Events detected:", result.events.length);
```

### Using Python

```python
import requests
import os

response = requests.post(
    'http://localhost:8080/test-message',
    headers={
        'Authorization': f"Bearer {os.getenv('TEST_ENDPOINT_TOKEN')}"
    },
    json={
        'text': 'מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין'
    }
)

result = response.json()
print(f"Events detected: {len(result['events'])}")
```

## Error Responses

### 401 Unauthorized

Missing or invalid authentication token (when `TEST_ENDPOINT_TOKEN` is set):

```json
{
  "error": "Unauthorized - Invalid or missing API token"
}
```

### 400 Bad Request

Missing or invalid `text` field:

```json
{
  "error": "Missing or invalid 'text' field in request body"
}
```

### 500 Internal Server Error

Processing error:

```json
{
  "error": "Internal server error",
  "details": "Error message here"
}
```

### 501 Not Implemented

Message handler not configured (shouldn't happen in normal operation):

```json
{
  "error": "Message handler not configured"
}
```

## Testing Complex Scenarios

### Multiple Events

```bash
curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "שבוע טוב!\n\nיום ראשון 22/12\nיום יצירה\n\nיום שני 23/12\nנוסעים לכפר בלום בשעה 9:00\n\nיום רביעי 25/12\nלא תתקיים פעולת ערב"
  }'
```

### English Events

```bash
curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Meeting tomorrow at 2pm in the office. Please bring your laptops."
  }'
```

### No Events (Testing False Positive Prevention)

```bash
curl -X POST http://localhost:8080/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I went to the movies yesterday. It was great!"
  }'
```

Expected response: `{"hasEvents": false, "events": []}`

## Production URL

When deployed on Railway, use your production domain:

```bash
https://whatsapp-me-production-1204.up.railway.app/test-message
```

## Security Considerations

### Environment Variable Setup

Set the `TEST_ENDPOINT_TOKEN` environment variable to enable authentication:

```bash
# Local development (.env file)
TEST_ENDPOINT_TOKEN=your-secret-token-here

# Railway (use Railway CLI or dashboard)
railway variables set TEST_ENDPOINT_TOKEN=your-secret-token-here
```

Generate a strong token:

```bash
# Using openssl
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Best Practices

✅ **Recommended:**

- Always set `TEST_ENDPOINT_TOKEN` in production
- Use a strong, randomly generated token (64+ characters)
- Rotate tokens periodically
- Never commit tokens to version control
- Monitor usage and costs (OpenAI API calls)

⚠️ **Without Token:** The endpoint is public and anyone with the URL can use it, consuming your OpenAI API quota.

## Troubleshooting

### Connection Refused

Make sure the application is running and the port is correct (8080 in production, 3000 locally).

### Empty Response

Check that you're using `POST` method and setting `Content-Type: application/json`.

### No Events Detected

The message might not contain clear event information. Try making the event details more explicit (date, time, location).
