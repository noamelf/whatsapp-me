import * as http from "http";
import * as crypto from "crypto";
import { ConfigService } from "./config-service";

// Type for chat provider function
type ChatProvider = () => Promise<{ id: string; name: string; isGroup: boolean }[]>;

// Type for status provider function
type StatusProvider = () => {
  isConnected: boolean;
  connectionState: string;
  qrCode: string | null;
};

/**
 * Simple admin server for managing WhatsApp bot configuration
 * Provides a web interface and API endpoints for configuration management
 */
export class AdminServer {
  private configService: ConfigService;
  private sessionToken: string | null = null;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private sessionExpiry = 0;
  private chatProvider?: ChatProvider;
  private statusProvider?: StatusProvider;

  constructor(
    configService: ConfigService,
    chatProvider?: ChatProvider,
    statusProvider?: StatusProvider
  ) {
    this.configService = configService;
    this.chatProvider = chatProvider;
    this.statusProvider = statusProvider;
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

    // Get WhatsApp connection status and QR code
    if (req.method === "GET" && url === "/admin/status") {
      this.handleGetStatus(res);
      return;
    }

    // Get chats
    if (req.method === "GET" && url === "/admin/chats") {
      void this.handleGetChats(res);
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
      monitorAllGroupChats: config.monitorAllGroupChats || false,
      targetGroupId: config.targetGroupId,
      targetGroupName: config.targetGroupName,
      lastUpdated: config.lastUpdated,
      hasPassword: this.configService.hasAdminPassword(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(safeConfig));
  }

  /**
   * Handle get chats request - fetch available chats from WhatsApp
   */
  /**
   * Handle get status request - returns WhatsApp connection status and QR code
   */
  private handleGetStatus(res: http.ServerResponse): void {
    try {
      if (!this.statusProvider) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Status provider not available",
          })
        );
        return;
      }

      const status = this.statusProvider();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    } catch (error) {
      console.error("Error fetching status:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Failed to fetch status",
          details: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Handle get chats request
   */
  private async handleGetChats(res: http.ServerResponse): Promise<void> {
    try {
      if (!this.chatProvider) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Chat provider not available - WhatsApp client may not be connected",
          })
        );
        return;
      }

      const chats = await this.chatProvider();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ chats }));
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Failed to fetch chats",
          details: error instanceof Error ? error.message : String(error),
        })
      );
    }
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
          monitorAllGroupChats?: boolean;
          targetGroupId?: string;
          targetGroupName?: string;
          newPassword?: string;
        };

        // Update monitor all group chats setting
        if (updates.monitorAllGroupChats !== undefined) {
          this.configService.setMonitorAllGroupChats(updates.monitorAllGroupChats);
        }

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
        .login-form, .admin-panel, .setup-screen {
            display: none;
        }
        .login-form.active, .admin-panel.active, .setup-screen.active {
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
        .qr-container {
            text-align: center;
            padding: 30px;
        }
        .qr-code {
            max-width: 300px;
            margin: 20px auto;
            border: 3px solid #667eea;
            border-radius: 12px;
            padding: 15px;
            background: white;
        }
        .setup-message {
            font-size: 18px;
            color: #333;
            margin: 20px 0;
        }
        .loading-spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
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

            <!-- Setup Screen (QR Code) -->
            <div class="setup-screen" id="setupScreen">
                <h2 style="margin-bottom: 20px; text-align: center;">WhatsApp Setup</h2>
                <div id="qrContainer" class="qr-container" style="display: none;">
                    <p class="setup-message">📱 Scan this QR code with your WhatsApp mobile app</p>
                    <img id="qrCodeImage" class="qr-code" alt="WhatsApp QR Code" />
                    <p class="help-text">Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                </div>
                <div id="connectingContainer" class="qr-container" style="display: none;">
                    <div class="loading-spinner"></div>
                    <p class="setup-message">⏳ Connecting to WhatsApp...</p>
                    <p class="help-text">Please wait while we establish the connection</p>
                </div>
                <div id="setupComplete" class="qr-container" style="display: none;">
                    <p class="setup-message" style="color: #28a745;">✅ WhatsApp connected successfully!</p>
                    <p class="help-text">Loading configuration interface...</p>
                </div>
            </div>

            <!-- Admin Panel -->
            <div class="admin-panel" id="adminPanel">
                <div id="successMessage" class="alert alert-success" style="display: none;"></div>
                <div id="errorMessage" class="alert alert-error" style="display: none;"></div>

                <!-- Monitored Chats Configuration -->
                <div class="section">
                    <h2>Monitored Chats</h2>
                    <form onsubmit="updateConfig(event)">
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="monitorAllGroupChats" onchange="toggleChatSelection()">
                                Monitor All Group Chats
                            </label>
                            <p class="help-text">
                                When checked, the bot will monitor all WhatsApp group chats for events.
                                Individual chat selection below will be ignored.
                            </p>
                        </div>

                        <div id="chatSelectionContainer">
                            <div class="form-group">
                                <label for="chatSearch">Search Chats</label>
                                <input type="text" id="chatSearch" placeholder="Search by chat name..." oninput="filterChats()">
                                <button type="button" class="btn btn-secondary" onclick="loadChats()" style="margin-top: 10px;">
                                    Refresh Chats from WhatsApp
                                </button>
                                <p class="help-text">
                                    Select chats to monitor for events. Search to filter the list.
                                </p>
                            </div>

                            <div class="form-group">
                                <div id="chatList" style="max-height: 300px; overflow-y: auto; border: 2px solid #e0e0e0; border-radius: 8px; padding: 10px;">
                                    <p style="color: #666; text-align: center;">Loading chats...</p>
                                </div>
                            </div>
                        </div>

                        <!-- Target Group Configuration -->
                        <div class="form-group">
                            <label for="targetGroup">Target Group for Event Summaries</label>
                            <input type="search" id="targetGroupSearch" placeholder="Search groups..." oninput="filterTargetGroups()" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 8px;">
                            <select id="targetGroup" size="6" style="width: 100%; padding: 8px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; height: auto;">
                                <option value="">Loading groups...</option>
                            </select>
                            <p class="help-text">
                                Select the WhatsApp group where event summaries will be sent. Use search to filter.
                            </p>
                        </div>

                        <button type="submit" class="btn">Save Configuration</button>
                        <button type="button" class="btn btn-secondary" onclick="loadConfig()">Reload</button>
                    </form>
                </div>

                <!-- Change Password -->
                <div class="section">
                    <div style="cursor: pointer; display: flex; align-items: center; justify-content: space-between;" onclick="togglePasswordSection()">
                        <h2 style="margin: 0;">Change Admin Password</h2>
                        <span id="passwordToggleIcon" style="font-size: 20px;">▼</span>
                    </div>
                    <div id="passwordSection" style="display: none; margin-top: 15px;">
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
        let statusCheckInterval = null;

        // Check if already logged in
        if (authToken) {
            checkWhatsAppStatus();
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
                    checkWhatsAppStatus();
                } else {
                    errorDiv.textContent = data.error || 'Login failed';
                    errorDiv.style.display = 'block';
                }
            } catch (error) {
                errorDiv.textContent = 'Network error. Please try again.';
                errorDiv.style.display = 'block';
            }
        }

        async function checkWhatsAppStatus() {
            try {
                const response = await fetch('/admin/status', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });

                if (response.status === 401) {
                    logout();
                    return;
                }

                const status = await response.json();

                if (status.isConnected) {
                    // WhatsApp is connected, show admin panel
                    showSetupComplete();
                    setTimeout(() => {
                        showAdminPanel();
                    }, 1500);
                } else if (status.qrCode) {
                    // Show QR code
                    showQRCode(status.qrCode);
                    startStatusPolling();
                } else {
                    // Connecting state
                    showConnecting();
                    startStatusPolling();
                }
            } catch (error) {
                console.error('Error checking WhatsApp status:', error);
                // Fallback to showing admin panel if status check fails
                showAdminPanel();
            }
        }

        function showQRCode(qrDataUrl) {
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('adminPanel').classList.remove('active');
            document.getElementById('setupScreen').classList.add('active');
            
            document.getElementById('qrContainer').style.display = 'block';
            document.getElementById('connectingContainer').style.display = 'none';
            document.getElementById('setupComplete').style.display = 'none';
            
            document.getElementById('qrCodeImage').src = qrDataUrl;
        }

        function showConnecting() {
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('adminPanel').classList.remove('active');
            document.getElementById('setupScreen').classList.add('active');
            
            document.getElementById('qrContainer').style.display = 'none';
            document.getElementById('connectingContainer').style.display = 'block';
            document.getElementById('setupComplete').style.display = 'none';
        }

        function showSetupComplete() {
            document.getElementById('qrContainer').style.display = 'none';
            document.getElementById('connectingContainer').style.display = 'none';
            document.getElementById('setupComplete').style.display = 'block';
            stopStatusPolling();
        }

        function startStatusPolling() {
            if (statusCheckInterval) return; // Already polling
            
            statusCheckInterval = setInterval(async () => {
                try {
                    const response = await fetch('/admin/status', {
                        headers: { 'Authorization': 'Bearer ' + authToken }
                    });

                    if (response.ok) {
                        const status = await response.json();
                        
                        if (status.isConnected) {
                            showSetupComplete();
                            setTimeout(() => {
                                showAdminPanel();
                            }, 1500);
                        } else if (status.qrCode) {
                            document.getElementById('qrCodeImage').src = status.qrCode;
                            if (document.getElementById('qrContainer').style.display === 'none') {
                                showQRCode(status.qrCode);
                            }
                        } else {
                            if (document.getElementById('connectingContainer').style.display === 'none') {
                                showConnecting();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error polling status:', error);
                }
            }, 2000); // Poll every 2 seconds
        }

        function stopStatusPolling() {
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
            }
        }

        function showAdminPanel() {
            stopStatusPolling();
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('setupScreen').classList.remove('active');
            document.getElementById('adminPanel').classList.add('active');
            loadConfig();
            loadChats();
        }

        let allChats = [];
        let selectedChatNames = [];

        async function loadChats() {
            const chatList = document.getElementById('chatList');
            chatList.innerHTML = '<p style="color: #666; text-align: center;">Loading chats from WhatsApp...</p>';
            
            try {
                const response = await fetch('/admin/chats', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });

                if (response.status === 401) {
                    logout();
                    return;
                }

                if (!response.ok) {
                    const error = await response.json();
                    chatList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error: ' + (error.error || 'Failed to load chats') + '</p>';
                    return;
                }

                const data = await response.json();
                allChats = data.chats || [];
                
                if (allChats.length === 0) {
                    chatList.innerHTML = '<p style="color: #666; text-align: center;">No chats found. Make sure WhatsApp is connected.</p>';
                    return;
                }

                renderChatList();
                populateTargetGroupDropdown();
            } catch (error) {
                chatList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Network error loading chats</p>';
            }
        }

        let filteredTargetGroups = [];

        function populateTargetGroupDropdown() {
            const targetGroupSelect = document.getElementById('targetGroup');
            
            // Only show groups in target dropdown (not direct chats)
            const groups = allChats.filter(chat => chat.isGroup);
            filteredTargetGroups = groups;
            
            if (groups.length === 0) {
                targetGroupSelect.innerHTML = '<option value="">No groups available</option>';
                return;
            }

            renderTargetGroups(groups);
        }

        function renderTargetGroups(groups) {
            const targetGroupSelect = document.getElementById('targetGroup');
            targetGroupSelect.innerHTML = groups.map(group => 
                \`<option value="\${group.id}">\${group.name}</option>\`
            ).join('');
        }

        function filterTargetGroups() {
            const searchTerm = document.getElementById('targetGroupSearch').value.toLowerCase();
            const groups = allChats.filter(chat => 
                chat.isGroup && chat.name.toLowerCase().includes(searchTerm)
            );
            renderTargetGroups(groups);
        }

        function renderChatList() {
            const chatList = document.getElementById('chatList');
            const searchTerm = document.getElementById('chatSearch').value.toLowerCase();
            
            const filteredChats = allChats.filter(chat => 
                chat.name.toLowerCase().includes(searchTerm)
            );

            if (filteredChats.length === 0) {
                chatList.innerHTML = '<p style="color: #666; text-align: center;">No chats match your search</p>';
                return;
            }

            chatList.innerHTML = filteredChats.map(chat => \`
                <div style="padding: 8px; border-bottom: 1px solid #e0e0e0;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" 
                               value="\${chat.name}"
                               \${selectedChatNames.includes(chat.name) ? 'checked' : ''}
                               onchange="toggleChatName(this.value, this.checked)"
                               style="margin-right: 10px;">
                        <span>\${chat.name}</span>
                        <span style="margin-left: auto; color: #666; font-size: 12px;">
                            \${chat.isGroup ? '📱 Group' : '👤 Direct'}
                        </span>
                    </label>
                </div>
            \`).join('');
        }

        function filterChats() {
            renderChatList();
        }

        function toggleChatName(chatName, checked) {
            if (checked) {
                if (!selectedChatNames.includes(chatName)) {
                    selectedChatNames.push(chatName);
                }
            } else {
                selectedChatNames = selectedChatNames.filter(name => name !== chatName);
            }
        }

        function toggleChatSelection() {
            const checkbox = document.getElementById('monitorAllGroupChats');
            const container = document.getElementById('chatSelectionContainer');
            if (checkbox.checked) {
                container.style.opacity = '0.5';
                container.style.pointerEvents = 'none';
            } else {
                container.style.opacity = '1';
                container.style.pointerEvents = 'auto';
            }
        }

        function togglePasswordSection() {
            const section = document.getElementById('passwordSection');
            const icon = document.getElementById('passwordToggleIcon');
            if (section.style.display === 'none') {
                section.style.display = 'block';
                icon.textContent = '▲';
            } else {
                section.style.display = 'none';
                icon.textContent = '▼';
            }
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

                // Populate form fields
                document.getElementById('monitorAllGroupChats').checked = config.monitorAllGroupChats || false;
                selectedChatNames = config.allowedChatNames || [];
                renderChatList();
                toggleChatSelection();
                
                // Set target group dropdown selection
                const targetGroupSelect = document.getElementById('targetGroup');
                if (config.targetGroupId) {
                    targetGroupSelect.value = config.targetGroupId;
                }
            } catch (error) {
                showError('Failed to load configuration');
            }
        }

        async function updateConfig(event) {
            event.preventDefault();

            const monitorAllGroupChats = document.getElementById('monitorAllGroupChats').checked;
            const targetGroupId = document.getElementById('targetGroup').value;
            
            // Find the group name from the selected ID
            const selectedGroup = allChats.find(chat => chat.id === targetGroupId);
            const targetGroupName = selectedGroup ? selectedGroup.name : '';

            try {
                const response = await fetch('/admin/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({
                        monitorAllGroupChats,
                        allowedChatNames: selectedChatNames,
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
            stopStatusPolling();
            
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
            document.getElementById('setupScreen').classList.remove('active');
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
