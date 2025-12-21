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

# Build headers
HEADERS="-H \"Content-Type: application/json\""
if [ -n "$TOKEN" ]; then
  HEADERS="$HEADERS -H \"Authorization: Bearer $TOKEN\""
  echo "Using authentication token"
fi

# Make the request
eval curl -X POST \"$URL\" \
  $HEADERS \
  -d "$(cat <<EOF
{
  "text": "$TEST_MESSAGE"
}
EOF
)" \
  | jq '.'

echo ""
echo "Test complete!"
