# Integration Test Suite

Comprehensive end-to-end test coverage for the WhatsApp Event Detection System.

## Overview

This test suite validates the complete pipeline from WhatsApp message reception through OpenAI event detection to calendar generation. It includes unit tests, integration tests, and end-to-end tests with proper mocking of external services.

## Test Structure

```
src/__tests__/
├── setup.ts                    # Jest setup and global configuration
├── openai-service.test.ts      # OpenAI service tests
├── whatsapp-client.test.ts     # WhatsApp client tests
├── e2e.test.ts                 # End-to-end integration tests
├── config.test.ts              # Configuration and edge cases
└── utils/
    └── test-helpers.ts         # Shared test utilities

src/__mocks__/
├── @whiskeysockets/baileys.ts  # Mock WhatsApp client
└── openai.ts                   # Mock OpenAI API

src/__fixtures__/
└── messages.json               # Test message fixtures
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

## Test Coverage

### OpenAI Service Tests (openai-service.test.ts)

- ✅ Event detection (Hebrew & English)
- ✅ Multi-event extraction
- ✅ False positive prevention
- ✅ Date/time parsing (relative dates, ISO 8601)
- ✅ Multi-language support
- ✅ Image analysis
- ✅ Error handling

### WhatsApp Client Tests (whatsapp-client.test.ts)

- ✅ Initialization and configuration
- ✅ Connection management
- ✅ Message filtering logic
- ✅ Group metadata caching
- ✅ Session management
- ✅ Chat name filtering
- ✅ Target group resolution
- ✅ Error handling

### End-to-End Tests (e2e.test.ts)

- ✅ Complete message processing flow
- ✅ Conversation context handling
- ✅ False positive prevention
- ✅ Date/time processing
- ✅ Multi-language support
- ✅ Event field extraction
- ✅ ISO date format compliance

### Configuration Tests (config.test.ts)

- ✅ Environment variable handling
- ✅ Target group resolution
- ✅ Edge cases (empty messages, special characters, etc.)
- ✅ Concurrency handling

## Mock Strategy

### WhatsApp Client Mock (`@whiskeysockets/baileys`)

- Simulates WhatsApp WebSocket connection
- Provides mock message events
- Handles group metadata
- No real WhatsApp connection required

### OpenAI API Mock (`openai`)

- Returns predefined responses based on message content
- Supports Hebrew and English detection
- Simulates multi-event extraction
- Faster and no API costs

## Test Fixtures

The `messages.json` file contains 19 test scenarios:

1. **Single Events**: Hebrew & English
2. **Multiple Events**: Hebrew & English
3. **False Positives**: Past events, casual chat, questions
4. **Date Formats**: Relative dates, Hebrew dates, numeric formats
5. **Edge Cases**: Empty messages, emojis, mixed languages
6. **Special Cases**: All-day events, recurring events, locations

## Future Enhancements

1. **Visual Regression Tests**: Test calendar rendering
2. **Performance Tests**: Message processing throughput
3. **Real API Integration Tests**: Optional tests with real OpenAI API
4. **Load Testing**: Concurrent message handling
5. **Coverage Reports**: Track test coverage over time

## Running Specific Test Suites

```bash
# Only OpenAI service tests
npm test openai-service

# Only WhatsApp client tests
npm test whatsapp-client

# Only E2E tests
npm test e2e

# Only config tests
npm test config
```

## Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test -- src/__tests__/openai-service.test.ts

# Run specific test case
npm test -- -t "should detect a single Hebrew event"

# Debug with node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

## CI/CD Integration

Tests are designed to run in CI/CD pipelines:

- ✅ No external dependencies required
- ✅ All services mocked
- ✅ Deterministic results
- ✅ Fast execution (~2 seconds)

Add to your CI workflow:

```yaml
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Checkly Integration Tests

In addition to Jest unit tests, the system includes Checkly monitors that test the production endpoint:

```bash
# Run Checkly tests locally
npm run checkly:test

# Deploy Checkly monitors
npm run checkly:deploy
```

Checkly tests include:

- Hebrew single event detection
- English single event detection
- Multiple events extraction
- False positive prevention (past events, casual chat)
- Image analysis
- Complex date/time parsing
- Empty message handling
- Response structure validation

## Test Patterns

### Creating Mock Messages

```typescript
import { createMockWAMessage } from "./utils/test-helpers";

const message = createMockWAMessage("Meeting tomorrow", {
  chatId: "test-group@g.us",
  isGroup: true,
  chatName: "Test Chat",
});
```

### Validating Results

```typescript
import { validateMultiEventResult } from './utils/test-helpers';

const result = await openaiService.analyzeMessage(...);
validateMultiEventResult(result);
```

### Loading Fixtures

```typescript
import { loadFixtures } from "./utils/test-helpers";

const fixtures = loadFixtures();
const hebrewMessage = fixtures.hebrewSingleEvent.text;
```

## Contributing

When adding new features:

1. **Add Fixtures**: Update `messages.json` with test cases
2. **Add Tests**: Create tests in appropriate file
3. **Run Tests**: Ensure all pass with `npm test`
4. **Check Coverage**: Run `npm run test:coverage`
5. **Update Mocks**: Enhance mocks if needed

## Test Results Summary

As of last run:

- ✅ **117 tests passing**
- ⚙️ **117 tests total**
- 📊 **100% pass rate**

All test suites pass:

- `openai-service.test.ts` - OpenAI service tests
- `whatsapp-client.test.ts` - WhatsApp client tests
- `e2e.test.ts` - End-to-end integration tests
- `config.test.ts` - Configuration and edge case tests
