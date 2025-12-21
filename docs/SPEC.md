# WhatsApp Event Detection System - Feature Specification

## Project Overview

A system that automatically monitors WhatsApp conversations, identifies event-related discussions, and converts them into actionable calendar entries. The system bridges the gap between casual event planning in chat and formal calendar management.

## Core Capabilities

### 1. WhatsApp Integration

- **Authentication**: Connect to personal WhatsApp account for message monitoring
- **Session Persistence**: Maintain connection without repeated authentication
- **Cross-Platform Operation**: Function on all major operating systems
- **Reliable Connection**: Automatically recover from connection interruptions

### 2. Message Monitoring

- **Real-Time Listening**: Monitor all incoming messages across conversations
- **Selective Processing**: Optionally filter which chats to monitor
- **Multi-Language Support**: Process messages in English and Hebrew
- **Context Awareness**: Consider conversation history for better understanding

### 3. Event Detection

- **Intelligent Analysis**: Distinguish between event planning and casual conversation
- **Event Classification**: Identify actual events versus scheduling discussions
- **Information Extraction**: Pull relevant details from natural conversation
- **Multi-Language Recognition**: Handle event discussions in multiple languages

### 4. Date and Time Understanding

- **Flexible Date Recognition**:
  - Absolute dates in various formats
  - Relative dates (tomorrow, next week)
  - Day names in English and Hebrew
  - Month and day combinations
- **Time Interpretation**:
  - Multiple time formats and conventions
  - Hebrew time expressions
  - Default assumptions for incomplete information
- **Smart Resolution**:
  - Handle ambiguous date references
  - Apply logical defaults for missing information
  - Respect local timezone conventions

### 5. Calendar Event Creation

- **Structured Event Data**: Generate complete event information including title, date, time, location, and description
- **Calendar Compatibility**: Create events that work with standard calendar applications
- **Duration Management**: Apply sensible default durations or extract specified timeframes
- **Event Completeness**: Include source context and relevant details

### 6. Event Distribution

- **Automated Sharing**: Send event summaries to designated group or contacts
- **Multiple Formats**: Provide both text summaries and calendar files
- **Source Attribution**: Identify where the event information originated
- **Easy Calendar Addition**: Enable recipients to quickly add events to their calendars

### 7. Configuration Management

- **Flexible Setup**: Allow customization of monitoring scope and behavior
- **Privacy Controls**: Control which conversations are monitored
- **Target Configuration**: Specify where event notifications are sent
- **Optional Filtering**: Choose specific chats or contacts to monitor

### 8. Reliability and Error Handling

- **Robust Operation**: Continue functioning despite temporary issues
- **Graceful Degradation**: Maintain core functionality when components fail
- **Recovery Mechanisms**: Automatically restore normal operation after problems
- **Data Protection**: Preserve user data and session information

## System Objectives

### Primary Goals

- **Reduce Manual Work**: Eliminate need to manually create calendar events from chat discussions
- **Prevent Missed Events**: Ensure important events don't get lost in conversation
- **Centralize Event Information**: Consolidate event details from multiple conversations
- **Streamline Event Sharing**: Automatically distribute event information to relevant people

### User Benefits

- **Time Saving**: Automatically convert conversations into calendar entries
- **Organization**: Keep track of events discussed across different chats
- **Accessibility**: Make events easily addable to personal calendars
- **Transparency**: Ensure all participants have access to event details

### Operational Requirements

- **Continuous Operation**: Run unattended for extended periods
- **Low Maintenance**: Require minimal user intervention once configured
- **Reliable Processing**: Consistently detect and process relevant events
- **Privacy Preservation**: Handle personal conversations responsibly

## Success Criteria

### Event Detection Accuracy

- **High Precision**: Minimize false positive event detection
- **Comprehensive Coverage**: Catch most genuine event discussions
- **Context Understanding**: Properly interpret conversational context
- **Language Flexibility**: Handle mixed-language conversations

### User Experience

- **Simple Setup**: Easy initial configuration and authentication
- **Transparent Operation**: Clear indication of system activity and status
- **Reliable Delivery**: Consistent event notification and sharing
- **Minimal Disruption**: Operate without interfering with normal WhatsApp usage

### System Performance

- **Real-Time Processing**: Process messages with minimal delay
- **Resource Efficiency**: Operate without significant system impact
- **Stable Operation**: Maintain consistent performance over time
- **Scalable Processing**: Handle varying message volumes effectively

## Agent Instructions: Model Guide

### Overview

The system uses OpenAI GPT‑5 family models to analyze WhatsApp messages and extract structured event data. Choose the model based on the task complexity and cost profile, and follow the parameter rules to avoid API errors.

### Available Models and When to Use

- **gpt-5-mini**: Cost‑optimized default for event extraction. Use for most conversations; supports text + image input and structured outputs.
- **gpt-5.2**: Use for complex or ambiguous messages where reasoning is beneficial (e.g., multiple events intertwined, sparse context, heavy image interpretation). Prefer the Responses API when leveraging reasoning features.
- **gpt-5.2-pro**: Use sparingly for very tough cases that require deeper thinking at higher cost.
- **gpt-5-nano**: High‑throughput simple tasks. Not recommended for nuanced event extraction; consider for lightweight classification or pre‑filtering.

### API Endpoint Guidance

- **Chat Completions API**: Supported for gpt‑5‑mini and gpt‑5.2 for text + image inputs and structured JSON outputs.
- **Responses API**: Preferred for gpt‑5.2 when using reasoning features (e.g., passing previous reasoning items). Not required for standard event extraction.

### Required Parameters and Constraints

- **Output tokens**: Use `max_completion_tokens` (not `max_tokens`).
- **Structured outputs**: Use `response_format: { type: "json_object" }` to receive parseable JSON.
- **Temperature/top_p/logprobs**: Do not send these to `gpt-5-mini`. They are unsupported and will raise errors. For `gpt-5.2`, these are only supported when using Responses API with `reasoning.effort` set to `none`; otherwise avoid them.
- **Vision inputs**: Include images via `messages[].content` using an `image_url` item with a data URI: `data:<mime>;base64,<payload>` and `detail: "auto"`.

### Output Schema Requirements

Models must return JSON conforming to:

```
{
  "hasEvents": boolean,
  "events": [
    {
      "isEvent": boolean,
      "summary": string|null,
      "title": string|null,
      "date": string|null,
      "time": string|null,
      "location": string|null,
      "description": string|null,
      "startDateISO": string|null,
      "endDateISO": string|null
    }
  ]
}
```

### Prompting and Locale Rules

- Provide Hebrew outputs for `summary`, `title`, `location`, and textual fields when the content is Hebrew.
- Keep `description` concise; do not repeat the raw message text.
- Extract all events in a single message (supporting multiple events).
- Convert date/time to Israel timezone and ISO format; apply defaults when missing (start 08:00, duration 1 hour).

### Model Selection Policy

- **Default**: `gpt-5-mini` for cost efficiency and strong baseline performance.
- **Escalate to `gpt-5.2`** when:
  - Repeated parse failures or inconsistent JSON.
  - Complex, multi‑event threads or heavy visual content.
  - Ambiguity requiring stronger reasoning.
- **Fallback**: Return to `gpt-5-mini` for routine processing once the edge case is handled.

### Error Handling

- If JSON parsing fails, log the raw content and retry once without optional parameters (e.g., image `detail`), maintaining the same output schema.
- Do not include unsupported parameters for the selected model; prefer prompt tuning over temperature/top_p.
