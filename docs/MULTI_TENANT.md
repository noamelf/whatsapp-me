# Multi-Tenant Configuration Guide

This guide explains how to configure and use the WhatsApp Event Detection System in multi-tenant mode, allowing you to run multiple WhatsApp accounts simultaneously.

## Overview

Multi-tenant mode enables you to:
- Monitor multiple WhatsApp accounts from a single deployment
- Send events to different target groups for each account
- Configure different chat filters per tenant
- Maintain isolated sessions and event tracking for each tenant

## Configuration Methods

### Single Tenant Mode (Environment Variables)

For backward compatibility, you can continue using environment variables for a single WhatsApp account. This mode is activated when `tenants.json` does not exist.

**`.env` file:**
```bash
OPENROUTER_API_KEY=your_api_key_here
TARGET_GROUP_ID=120363123456789012@g.us
TARGET_GROUP_NAME=My Events
ALLOWED_CHAT_NAMES=Family,Work
```

### Multi-Tenant Mode (Configuration File)

To enable multi-tenant mode, create a `tenants.json` file in the project root.

**`tenants.json` structure:**
```json
{
  "tenants": [
    {
      "id": "personal",
      "targetGroupId": "120363123456789012@g.us",
      "targetGroupName": "Personal Events",
      "allowedChatNames": ["Family", "Friends"],
      "sessionDir": ".baileys_auth_personal"
    },
    {
      "id": "work",
      "targetGroupId": "120363987654321098@g.us",
      "targetGroupName": "Work Events",
      "allowedChatNames": ["Work Team", "Projects"],
      "sessionDir": ".baileys_auth_work"
    }
  ]
}
```

## Configuration Fields

### Required Fields

- **`id`** (string): Unique identifier for the tenant
  - Must be unique across all tenants
  - Used in logs to identify which tenant is processing messages
  - Example: `"personal"`, `"work"`, `"tenant1"`

### Optional Fields

- **`targetGroupId`** (string): WhatsApp group ID where events will be sent
  - Format: `{phone_number}@g.us`
  - If not provided, must provide `targetGroupName`
  - More reliable than using name (recommended)
  - Example: `"120363123456789012@g.us"`

- **`targetGroupName`** (string): Name of the WhatsApp group
  - Used to search for the group if `targetGroupId` is not provided
  - Falls back to `"אני"` if neither ID nor name is provided
  - Example: `"My Events Group"`

- **`allowedChatNames`** (array of strings): Filter which chats to monitor
  - If empty or not provided, all chats are monitored
  - Partial matching is used (e.g., `"Family"` matches `"Family Group"`)
  - Case-sensitive
  - Example: `["Family", "Work Team", "Book Club"]`

- **`sessionDir`** (string): Custom directory for session storage
  - If not provided, defaults to `.baileys_auth_{tenantId}`
  - Each tenant must have a separate session directory
  - Example: `".baileys_auth_personal"`

## Setup Instructions

### 1. Create Configuration File

Copy the example configuration:
```bash
cp tenants.json.example tenants.json
```

Edit `tenants.json` with your tenant configurations.

### 2. Set Environment Variables

You still need to set the OpenRouter API key in your `.env` file:
```bash
OPENROUTER_API_KEY=your_api_key_here
```

Note: When `tenants.json` exists, all other environment variables (except `OPENROUTER_API_KEY`) are ignored.

### 3. Start the Application

```bash
npm start
```

### 4. Scan QR Codes

When starting for the first time:
1. Each tenant will display its own QR code sequentially
2. Scan each QR code with the corresponding WhatsApp account
3. Sessions are saved separately for each tenant
4. Future restarts won't require QR code scanning

## Finding Your WhatsApp Group ID

If you don't know your target group ID:

1. Temporarily use only `targetGroupName` in your tenant configuration
2. Start the application
3. The bot will search for the group and log the ID in the console:
   ```
   ✅ Found target group "My Events" with ID: 120363123456789012@g.us
   ```
4. Copy this ID and add it as `targetGroupId` in your configuration
5. Restart the application

## Health Check Endpoint

The `/health` endpoint reports status for all tenants:

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "whatsappConnected": true,
  "connectionState": "open",
  "uptime": 3600,
  "timestamp": "2024-12-24T20:00:00.000Z",
  "tenantStatuses": [
    {
      "tenantId": "personal",
      "isConnected": true,
      "connectionState": "open",
      "hasEverConnected": true,
      "targetGroupName": "Personal Events"
    },
    {
      "tenantId": "work",
      "isConnected": true,
      "connectionState": "open",
      "hasEverConnected": true,
      "targetGroupName": "Work Events"
    }
  ]
}
```

## Deployment Considerations

### Railway Deployment

When deploying to Railway with multi-tenant mode:

1. **Volume Mount**: Update `railway.toml` to include all tenant session directories:
   ```toml
   [[mounts]]
   source = "baileys_auth"
   destination = "/app/.baileys_auth_*"
   ```

2. **Environment Variables**: Set `OPENROUTER_API_KEY` in the Railway dashboard

3. **Configuration File**: Upload `tenants.json` to your Railway service or add it to your repository

### Session Storage

- Each tenant stores its session in a separate directory
- Session files include authentication credentials and group cache
- Keep session directories backed up to avoid re-scanning QR codes
- Never commit session directories to version control (they're in `.gitignore`)

## Example Use Cases

### Personal and Work Accounts
```json
{
  "tenants": [
    {
      "id": "personal",
      "targetGroupName": "Personal Calendar",
      "allowedChatNames": ["Family", "Friends"]
    },
    {
      "id": "work",
      "targetGroupName": "Work Calendar",
      "allowedChatNames": ["Work Team", "Projects"]
    }
  ]
}
```

### Multiple Clients/Projects
```json
{
  "tenants": [
    {
      "id": "client_a",
      "targetGroupId": "120363111111111111@g.us",
      "allowedChatNames": ["Client A Team"]
    },
    {
      "id": "client_b",
      "targetGroupId": "120363222222222222@g.us",
      "allowedChatNames": ["Client B Team"]
    }
  ]
}
```

### Department Separation
```json
{
  "tenants": [
    {
      "id": "sales",
      "targetGroupName": "Sales Events",
      "allowedChatNames": ["Sales"]
    },
    {
      "id": "engineering",
      "targetGroupName": "Engineering Events",
      "allowedChatNames": ["Engineering", "DevOps"]
    },
    {
      "id": "marketing",
      "targetGroupName": "Marketing Events",
      "allowedChatNames": ["Marketing"]
    }
  ]
}
```

## Troubleshooting

### Configuration Not Loading

**Problem**: Application starts but doesn't process messages
**Solution**: Check console logs for tenant loading messages. Verify `tenants.json` syntax with a JSON validator.

### QR Code Authentication Issues

**Problem**: QR code doesn't appear for a specific tenant
**Solution**: 
- Check that `sessionDir` is unique for each tenant
- Delete the session directory and restart to get a fresh QR code
- Verify internet connection

### Events Not Sent to Target Group

**Problem**: Events detected but not sent to WhatsApp group
**Solution**:
- Verify `targetGroupId` or `targetGroupName` is correct
- Check that the WhatsApp account is a member of the target group
- Review console logs for group search results

### High Memory Usage

**Problem**: Application uses too much memory with multiple tenants
**Solution**:
- Reduce the number of `allowedChatNames` per tenant
- Limit the number of simultaneous tenants
- Consider running separate instances instead of multi-tenant mode

## Migration from Single to Multi-Tenant

To migrate from single-tenant to multi-tenant mode:

1. **Backup your session**: Copy `.baileys_auth` to `.baileys_auth_default`

2. **Create `tenants.json`**:
   ```json
   {
     "tenants": [
       {
         "id": "default",
         "targetGroupId": "YOUR_EXISTING_GROUP_ID",
         "sessionDir": ".baileys_auth_default"
       }
     ]
   }
   ```

3. **Add more tenants** as needed

4. **Restart the application** - your existing session will be preserved

## API Changes

The test endpoint (`POST /test-message`) continues to work in multi-tenant mode:
- Uses the first tenant for processing (backward compatible)
- Returns events detected by the first tenant's configuration

## Security Considerations

- **Sensitive Data**: `tenants.json` contains group IDs which could be sensitive
- **Access Control**: Keep `tenants.json` out of version control (it's in `.gitignore`)
- **API Keys**: All tenants share the same OpenRouter API key
- **Session Security**: Session directories contain authentication credentials - protect them

## Limitations

- All tenants share the same OpenRouter API key and costs
- QR code scanning must be done sequentially, not in parallel
- Each tenant requires its own WhatsApp account
- Maximum number of tenants limited by system resources

## Support

For issues or questions about multi-tenant configuration:
1. Check the console logs for tenant initialization messages
2. Verify `tenants.json` syntax
3. Review the example configuration in `tenants.json.example`
4. Open an issue on GitHub with your configuration (remove sensitive IDs)
