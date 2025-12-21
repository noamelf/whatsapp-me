#!/bin/bash

# Test message endpoint
# Usage: ./test-endpoint.sh [URL]
# Default URL: http://localhost:8080/test-message
# Set TEST_TOKEN environment variable for authentication

URL="${1:-http://localhost:8080/test-message}"
TOKEN="${TEST_TOKEN:-}"

echo "Testing event detection endpoint: $URL"
echo ""

# Test message in Hebrew with multiple events
TEST_MESSAGE='שבוע טוב!

יום ראשון 22/12
יום יצירה
פעילות משותפת לכיתות א-ד.

יום שני 23/12 
נוסעים לכפר בלום בשעה 9:00.
חזרה משוערת לצוותא בשעה 12:30.

יום רביעי 25/12 
לא תתקיים פעולת ערב.'

# Build curl command with proper JSON escaping
JSON_PAYLOAD=$(jq -n --arg text "$TEST_MESSAGE" '{text: $text}')

# Build headers
if [ -n "$TOKEN" ]; then
  echo "Using authentication token"
  curl -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$JSON_PAYLOAD" | jq '.'
else
  curl -X POST "$URL" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" | jq '.'
fi

echo ""
echo "Test complete!"
