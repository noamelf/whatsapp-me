import * as http from "http";
import * as crypto from "crypto";
import { ConfigService } from "./config-service";

/**
 * Simple admin server for managing WhatsApp bot configuration
 * Provides a web interface and API endpoints for configuration management
 */
export class AdminServer {
  private configService: ConfigService;
  private sessionToken: string | null = null;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private sessionExpiry = 0;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  /**
   * Hash a password using SHA-256
   */
  private hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  /**
   * Verify if provided password matches stored hash
   */
  private verifyPassword(password: string): boolean {
    const storedHash = this.configService.getAdminPasswordHash();
    if (!storedHash) {
      // No password set yet, accept any password and store it
      const hash = this.hashPassword(password);
      this.configService.setAdminPassword(hash);
      return true;
    }
    return this.hashPassword(password) === storedHash;
  }

  /**
   * Create a new session token
   */
  private createSession(): string {
    this.sessionToken = crypto.randomBytes(32).toString("hex");
    this.sessionExpiry = Date.now() + this.sessionTimeout;
    return this.sessionToken;
  }

  /**
   * Verify if session token is valid
   */
  private verifySession(token: string): boolean {
    if (!this.sessionToken || token !== this.sessionToken) {
      return false;
    }
    if (Date.now() > this.sessionExpiry) {
      this.sessionToken = null;
      return false;
    }
    // Extend session on activity
    this.sessionExpiry = Date.now() + this.sessionTimeout;
    return true;
  }

  /**
   * Handle admin API requests
   */
  public handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const url = req.url || "";

    // Serve admin interface HTML
    if (req.method === "GET" && url === "/admin") {
      this.serveAdminPage(res);
      return;
    }

    // Handle login
    if (req.method === "POST" && url === "/admin/login") {
      this.handleLogin(req, res);
      return;
    }

    // Handle logout
    if (req.method === "POST" && url === "/admin/logout") {
      this.handleLogout(req, res);
      return;
    }

    // All other endpoints require authentication
    const authHeader = req.headers["authorization"];
    const token = authHeader?.replace(/^Bearer /i, "").trim() || "";

    if (!this.verifySession(token)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized - Please login" }));
      return;
    }

    // Get configuration
    if (req.method === "GET" && url === "/admin/config") {
      this.handleGetConfig(res);
      return;
    }

    // Update configuration
    if (req.method === "POST" && url === "/admin/config") {
      this.handleUpdateConfig(req, res);
      return;
    }

    // Not found
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  /**
   * Handle login request
   */
  private handleLogin(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const { password } = JSON.parse(body) as { password: string };

        if (!password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Password required" }));
          return;
        }

        if (this.verifyPassword(password)) {
          const token = this.createSession();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ token, expiresIn: this.sessionTimeout }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid password" }));
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
  }

  /**
   * Handle logout request
   */
  private handleLogout(
    _req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    this.sessionToken = null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  }

  /**
   * Handle get configuration request
   */
  private handleGetConfig(res: http.ServerResponse): void {
    const config = this.configService.getConfig();
    // Don't send password hash to client
    const safeConfig = {
      allowedChatNames: config.allowedChatNames,
      targetGroupId: config.targetGroupId,
      targetGroupName: config.targetGroupName,
      lastUpdated: config.lastUpdated,
      hasPassword: this.configService.hasAdminPassword(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(safeConfig));
  }

  /**
   * Handle update configuration request
   */
  private handleUpdateConfig(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const updates = JSON.parse(body) as {
          allowedChatNames?: string[];
          targetGroupId?: string;
          targetGroupName?: string;
          newPassword?: string;
        };

        // Update configuration
        if (updates.allowedChatNames !== undefined) {
          this.configService.setAllowedChatNames(updates.allowedChatNames);
        }

        if (updates.targetGroupId !== undefined || updates.targetGroupName !== undefined) {
          const groupId = updates.targetGroupId ?? this.configService.getTargetGroupId();
          const groupName = updates.targetGroupName ?? this.configService.getTargetGroupName();
          this.configService.setTargetGroup(groupId, groupName);
        }

        // Update password if provided
        if (updates.newPassword) {
          const hashedPassword = this.hashPassword(updates.newPassword);
          this.configService.setAdminPassword(hashedPassword);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            message: "Configuration updated successfully",
          })
        );
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Invalid request",
            details: error instanceof Error ? error.message : String(error),
          })
        );
      }
    });
  }

  /**
   * Serve the admin interface HTML page
   */
  private serveAdminPage(res: http.ServerResponse): void {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Admin</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header p {
            opacity: 0.9;
            font-size: 14px;
        }
        .content {
            padding: 30px;
        }
        .login-form, .admin-panel {
            display: none;
        }
        .login-form.active, .admin-panel.active {
            display: block;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }
        input[type="password"],
        input[type="text"],
        textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        textarea {
            min-height: 100px;
            resize: vertical;
            font-family: inherit;
        }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .btn:active {
            transform: translateY(0);
        }
        .btn-secondary {
            background: #6c757d;
            margin-left: 10px;
        }
        .btn-secondary:hover {
            box-shadow: 0 4px 12px rgba(108, 117, 125, 0.4);
        }
        .info-box {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }
        .info-box p {
            margin: 5px 0;
            font-size: 14px;
            color: #555;
        }
        .info-box strong {
            color: #333;
        }
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        .section {
            margin-bottom: 30px;
            padding-bottom: 30px;
            border-bottom: 1px solid #e0e0e0;
        }
        .section:last-child {
            border-bottom: none;
        }
        .section h2 {
            font-size: 20px;
            margin-bottom: 15px;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 WhatsApp Bot Admin</h1>
            <p>Manage your WhatsApp event detection bot configuration</p>
        </div>
        <div class="content">
            <!-- Login Form -->
            <div class="login-form active" id="loginForm">
                <h2 style="margin-bottom: 20px;">Login</h2>
                <div id="loginError" class="alert alert-error" style="display: none;"></div>
                <form onsubmit="login(event)">
                    <div class="form-group">
                        <label for="password">Admin Password</label>
                        <input type="password" id="password" required placeholder="Enter admin password">
                        <p class="help-text">First login will set the admin password</p>
                    </div>
                    <button type="submit" class="btn">Login</button>
                </form>
            </div>

            <!-- Admin Panel -->
            <div class="admin-panel" id="adminPanel">
                <div id="successMessage" class="alert alert-success" style="display: none;"></div>
                <div id="errorMessage" class="alert alert-error" style="display: none;"></div>

                <!-- Current Configuration -->
                <div class="section">
                    <h2>Current Configuration</h2>
                    <div class="info-box" id="currentConfig">
                        <p><strong>Loading...</strong></p>
                    </div>
                </div>

                <!-- Monitored Chats Configuration -->
                <div class="section">
                    <h2>Monitored Chats</h2>
                    <form onsubmit="updateConfig(event)">
                        <div class="form-group">
                            <label for="allowedChats">Allowed Chat Names (one per line)</label>
                            <textarea id="allowedChats" placeholder="Family Group&#10;Work Team&#10;Friends Chat"></textarea>
                            <p class="help-text">
                                Enter chat names to monitor, one per line. If empty, all chats will be monitored.
                                Names are case-sensitive and support partial matching.
                            </p>
                        </div>

                        <!-- Target Group Configuration -->
                        <div class="form-group">
                            <label for="targetGroupId">Target Group ID</label>
                            <input type="text" id="targetGroupId" placeholder="120363123456789012@g.us">
                            <p class="help-text">
                                The WhatsApp group ID where event summaries will be sent.
                                Check the logs when the bot starts to find group IDs.
                            </p>
                        </div>

                        <div class="form-group">
                            <label for="targetGroupName">Target Group Name</label>
                            <input type="text" id="targetGroupName" placeholder="אני">
                            <p class="help-text">
                                The name of the WhatsApp group (used if Group ID is not set).
                            </p>
                        </div>

                        <button type="submit" class="btn">Save Configuration</button>
                        <button type="button" class="btn btn-secondary" onclick="loadConfig()">Reload</button>
                    </form>
                </div>

                <!-- Change Password -->
                <div class="section">
                    <h2>Change Admin Password</h2>
                    <form onsubmit="changePassword(event)">
                        <div class="form-group">
                            <label for="newPassword">New Password</label>
                            <input type="password" id="newPassword" required placeholder="Enter new password">
                        </div>
                        <div class="form-group">
                            <label for="confirmPassword">Confirm Password</label>
                            <input type="password" id="confirmPassword" required placeholder="Confirm new password">
                        </div>
                        <button type="submit" class="btn">Change Password</button>
                    </form>
                </div>

                <!-- Logout -->
                <div style="text-align: center; padding-top: 20px;">
                    <button class="btn btn-secondary" onclick="logout()">Logout</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        let authToken = sessionStorage.getItem('adminToken');

        // Check if already logged in
        if (authToken) {
            showAdminPanel();
        }

        async function login(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');

            try {
                const response = await fetch('/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                const data = await response.json();

                if (response.ok) {
                    authToken = data.token;
                    sessionStorage.setItem('adminToken', authToken);
                    showAdminPanel();
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        }

        function showAdminPanel() {
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('adminPanel').classList.add('active');
            loadConfig();
        }

        async function loadConfig() {
            try {
                const response = await fetch('/admin/config', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });

                if (response.status === 401) {
                    logout();
                    return;
                }

                const config = await response.json();

                // Display current configuration
                const configDiv = document.getElementById('currentConfig');
                configDiv.innerHTML = \`
                    <p><strong>Allowed Chats:</strong> \${config.allowedChatNames.length > 0 ? config.allowedChatNames.join(', ') : 'All chats'}</p>
                    <p><strong>Target Group ID:</strong> \${config.targetGroupId || 'Not set'}</p>
                    <p><strong>Target Group Name:</strong> \${config.targetGroupName || 'Not set'}</p>
                    <p><strong>Last Updated:</strong> \${new Date(config.lastUpdated).toLocaleString()}</p>
                \`;

                // Populate form fields
                document.getElementById('allowedChats').value = config.allowedChatNames.join('\\n');
                document.getElementById('targetGroupId').value = config.targetGroupId || '';
                document.getElementById('targetGroupName').value = config.targetGroupName || '';
            } catch (error) {
                showError('Failed to load configuration');
            }
        }

        async function updateConfig(event) {
            event.preventDefault();

            const allowedChatsText = document.getElementById('allowedChats').value;
            const allowedChatNames = allowedChatsText
                .split('\\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const targetGroupId = document.getElementById('targetGroupId').value.trim();
            const targetGroupName = document.getElementById('targetGroupName').value.trim();

            try {
                const response = await fetch('/admin/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({
                        allowedChatNames,
                        targetGroupId,
                        targetGroupName
                    })
                });

                if (response.status === 401) {
                    logout();
                    return;
                }

                const data = await response.json();

                if (response.ok) {
                    showSuccess('Configuration updated successfully! Note: Restart the bot for changes to take full effect.');
                    loadConfig();
                } else {
                    showError(data.error || 'Failed to update configuration');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        }

        async function changePassword(event) {
            event.preventDefault();

            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (newPassword !== confirmPassword) {
                showError('Passwords do not match');
                return;
            }

            try {
                const response = await fetch('/admin/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ newPassword })
                });

                if (response.status === 401) {
                    logout();
                    return;
                }

                const data = await response.json();

                if (response.ok) {
                    showSuccess('Password changed successfully!');
                    document.getElementById('newPassword').value = '';
                    document.getElementById('confirmPassword').value = '';
                } else {
                    showError(data.error || 'Failed to change password');
                }
            } catch (error) {
                showError('Network error. Please try again.');
            }
        }

        async function logout() {
            try {
                await fetch('/admin/logout', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
            } catch (error) {
                // Ignore errors
            }

            authToken = null;
            sessionStorage.removeItem('adminToken');
            document.getElementById('adminPanel').classList.remove('active');
            document.getElementById('loginForm').classList.add('active');
            document.getElementById('password').value = '';
        }

        function showSuccess(message) {
            const successDiv = document.getElementById('successMessage');
            const errorDiv = document.getElementById('errorMessage');
            successDiv.textContent = message;
            successDiv.style.display = 'block';
            errorDiv.style.display = 'none';
            setTimeout(() => {
                successDiv.style.display = 'none';
            }, 5000);
        }

        function showError(message) {
            const successDiv = document.getElementById('successMessage');
            const errorDiv = document.getElementById('errorMessage');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
        }
    </script>
</body>
</html>
    `;

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  }
}
