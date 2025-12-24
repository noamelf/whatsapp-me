# Admin Interface

The WhatsApp Event Detection Bot includes a web-based admin interface for managing configuration without editing environment variables or restarting the application.

## Features

- **Web-based Configuration Management**: Update settings through a simple web interface
- **Session-based Authentication**: Secure login with password protection
- **Persistent Storage**: Configuration is saved to a JSON file and persists across restarts
- **Real-time Updates**: View current configuration and make changes instantly
- **Monitored Chats Management**: Add or remove chats to monitor for events
- **Target Group Configuration**: Set where event summaries should be sent
- **Password Management**: Change admin password through the interface

## Accessing the Admin Interface

The admin interface is available at:

```
http://localhost:3000/admin
```

Or if deployed on Railway or another service:

```
https://your-app-url.railway.app/admin
```

## First-Time Setup

### Setting Initial Password

You have two options for setting the initial admin password:

**Option 1: Environment Variable (Recommended)**

Add to your `.env` file:
```bash
ADMIN_PASSWORD=your-secure-password-here
```

**Option 2: First Login**

If no `ADMIN_PASSWORD` is set in the environment, the first password you enter when logging in will become the admin password. This password is then hashed and stored securely.

### Generating a Secure Password

Use a password manager or generate a secure password with:

```bash
openssl rand -base64 32
```

## Using the Admin Interface

### Login

1. Navigate to `/admin`
2. Enter the admin password
3. Click "Login"

The session will remain active for 30 minutes of inactivity.

### Managing Monitored Chats

The "Monitored Chats" section allows you to specify which WhatsApp chats should be analyzed for events:

1. Enter chat names, one per line
2. Names are case-sensitive and use partial matching
   - Example: "Family Group" will match "My Family Group" or "Family Group Chat"
3. Leave empty to monitor all chats
4. Click "Save Configuration"

**Example:**
```
Family Group
Work Team
Book Club
Friends Chat
```

### Configuring Target Group

The target group is where event summaries will be sent:

1. **Target Group ID** (Recommended): Use the full WhatsApp group ID
   - Format: `120363123456789012@g.us`
   - Find this in the bot logs when it connects
   
2. **Target Group Name**: Use the group name if you don't have the ID
   - The bot will search for a group with this name
   - Less reliable than using the group ID

### Changing Admin Password

1. Scroll to "Change Admin Password"
2. Enter new password
3. Confirm the password
4. Click "Change Password"

The new password will take effect immediately.

### Logout

Click the "Logout" button at the bottom of the page to end your session.

## Configuration Storage

Admin configuration is stored in:
```
.baileys_auth/admin_config.json
```

This file contains:
- Allowed chat names
- Target group ID and name
- Hashed admin password
- Last update timestamp

**Note:** The password is hashed using SHA-256 and is never stored in plain text.

## Environment Variables vs Admin Interface

The system supports both configuration methods:

1. **Environment Variables** (`.env` file):
   - `ALLOWED_CHAT_NAMES`: Comma-separated list of chat names
   - `TARGET_GROUP_ID`: Group ID for event summaries
   - `TARGET_GROUP_NAME`: Group name for event summaries
   - `ADMIN_PASSWORD`: Initial admin password

2. **Admin Interface** (persistent JSON file):
   - Settings configured through the web interface
   - Stored in `admin_config.json`

**Priority:**
- Environment variables take precedence for `ALLOWED_CHAT_NAMES`, `TARGET_GROUP_ID`, and `TARGET_GROUP_NAME`
- If environment variables are not set, values from `admin_config.json` are used
- This allows deployment-specific overrides while maintaining persistent defaults

## Security Considerations

### Authentication

- Password is hashed using SHA-256 before storage
- Session tokens are random 32-byte hex strings
- Sessions expire after 30 minutes of inactivity
- Sessions are stored in memory (cleared on restart)

### Access Control

- All admin endpoints require authentication
- Login attempts with wrong password return 401 Unauthorized
- No rate limiting (consider adding for production use)

### Production Deployment

For production deployments:

1. **Set a strong admin password** in environment variables
2. **Use HTTPS** to protect credentials in transit
3. **Restrict access** to the admin interface:
   - Use firewall rules
   - Use a VPN or private network
   - Add IP allowlist if needed
4. **Monitor access logs** for suspicious activity
5. **Regular password rotation** is recommended

### Security Notes

- The admin interface has no built-in rate limiting
- Consider adding a reverse proxy (like nginx) with rate limiting for production
- Password reset requires file system access (edit/delete `admin_config.json`)

## API Endpoints

The admin interface uses these REST endpoints:

### `POST /admin/login`
Login to get a session token.

**Request:**
```json
{
  "password": "your-password"
}
```

**Response:**
```json
{
  "token": "session-token",
  "expiresIn": 1800000
}
```

### `POST /admin/logout`
Invalidate current session.

**Headers:**
```
Authorization: Bearer <token>
```

### `GET /admin/config`
Get current configuration.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "allowedChatNames": ["Family Group", "Work Team"],
  "targetGroupId": "120363123456789012@g.us",
  "targetGroupName": "אני",
  "lastUpdated": "2025-12-24T21:00:00.000Z",
  "hasPassword": true
}
```

### `POST /admin/config`
Update configuration.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "allowedChatNames": ["Chat1", "Chat2"],
  "targetGroupId": "120363123456789012@g.us",
  "targetGroupName": "My Group",
  "newPassword": "optional-new-password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully"
}
```

## Troubleshooting

### Can't Access Admin Interface

1. **Check the server is running:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Verify the port:**
   - Default is 3000
   - Can be changed with `PORT` environment variable

3. **Check firewall rules** if deployed remotely

### Forgot Password

To reset the admin password:

1. Stop the bot
2. Delete or edit `.baileys_auth/admin_config.json`
3. Remove the `adminPassword` field or delete the entire file
4. Restart the bot
5. Set a new password on first login

Alternatively, set `ADMIN_PASSWORD` in `.env` and restart.

### Configuration Not Updating

1. **Check environment variables**: They take precedence over admin config
2. **Restart the bot**: Some changes require a restart for full effect
3. **Check file permissions**: Ensure the bot can write to `.baileys_auth/`

### Session Expired

Sessions expire after 30 minutes of inactivity. Simply log in again.

## Development

### Running Locally

```bash
npm run dev
```

Then access: http://localhost:3000/admin

### Testing the Admin Interface

You can test the API endpoints with curl:

```bash
# Login
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password"}'

# Get config (replace TOKEN with the token from login)
curl http://localhost:3000/admin/config \
  -H "Authorization: Bearer TOKEN"

# Update config
curl -X POST http://localhost:3000/admin/config \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"allowedChatNames": ["Test Chat"]}'
```

## Future Enhancements

Potential improvements for the admin interface:

- [ ] Rate limiting for login attempts
- [ ] Multi-user support with different roles
- [ ] Audit log of configuration changes
- [ ] Real-time chat list from WhatsApp
- [ ] Group list browser for easy target selection
- [ ] 2FA/MFA support
- [ ] Password strength requirements
- [ ] Session management (view/revoke active sessions)
- [ ] Dark mode toggle
