import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";

const TEST_URL =
  process.env.TEST_MESSAGE_URL ||
  "https://whatsapp-me-production-1204.up.railway.app/test-message";

// Use handlebars syntax for runtime environment variable evaluation
const headers: { key: string; value: string }[] = [
  { key: "Content-Type", value: "application/json" },
  { key: "Authorization", value: "Bearer {{TEST_ENDPOINT_TOKEN}}" },
];

// Use a simple event message expected to yield at least one event.
const payload = {
  text: "מחר בשעה 10:00 יש לנו פגישה בקפה נחלת בנימין",
};

new ApiCheck("test-message-api", {
  name: "Test Message API returns events",
  activated: true,
  degradedResponseTime: 20000,
  maxResponseTime: 25000,
  frequency: Frequency.EVERY_1H,
  locations: ["us-east-1"],
  request: {
    method: "POST",
    url: TEST_URL,
    headers,
    body: JSON.stringify(payload),
    assertions: [
      // HTTP 200
      AssertionBuilder.statusCode().equals(200),
      // JSON: hasEvents === true
      AssertionBuilder.jsonBody("$.hasEvents").equals(true),
    ],
  },
});
