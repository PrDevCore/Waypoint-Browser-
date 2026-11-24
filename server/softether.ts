import http from "http";
import https from "https";
import { URL } from "url";

// SoftEther VPN Server JSON-RPC configuration
interface SoftetherConfig {
  serverUrl: string; // e.g., "http://192.168.1.100:5555" or "https://localhost:5555"
  adminPassword: string;
  hubName: string; // VPN hub name (default: "DEFAULT")
}

// Default configuration
const DEFAULT_CONFIG: SoftetherConfig = {
  serverUrl: "http://localhost:5555",
  adminPassword: "",
  hubName: "DEFAULT",
};

// Interface for JSON-RPC request
interface JsonRpcRequest {
  method: string;
  params: any[];
  id: number | string;
}

// Interface for JSON-RPC response
interface JsonRpcResponse {
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// SoftEther VPN Server service
export class SoftetherVpnService {
  private config: SoftetherConfig;
  private hubName: string;

  constructor(config?: Partial<SoftetherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hubName = this.config.hubName;
  }

  // Set configuration
  setConfig(config: Partial<SoftetherConfig>) {
    this.config = { ...this.config, ...config };
    if (config.hubName) {
      this.hubName = config.hubName;
    }
  }

  // Build JSON-RPC request
  private buildRequest(method: string, params: any[]): JsonRpcRequest {
    return {
      method,
      params,
      id: Date.now(),
    };
  }

  // Make JSON-RPC call
  private makeRpcCall(request: JsonRpcRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(request);
      const parsedUrl = new URL(this.config.serverUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;

      // Basic Auth header for SoftEther admin access if password is provided
      const headers: Record<string, any> = {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      };

      if (this.config.adminPassword) {
        const auth = Buffer.from(`:${this.config.adminPassword}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 5555),
        path: parsedUrl.pathname === "/" ? "" : parsedUrl.pathname,
        method: "POST",
        headers,
      };

      const req = client.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          try {
            const response: JsonRpcResponse = JSON.parse(responseData);
            if (response.error) {
              reject(new Error(`JSON-RPC error: ${response.error.message} (code: ${response.error.code})`));
            } else {
              resolve(response.result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse JSON-RPC response: ${String(e)} (Raw: ${responseData})`));
          }
        });
      });

      req.on("error", (e) => {
        reject(new Error(`JSON-RPC request error: ${String(e)}`));
      });

      req.write(data);
      req.end();
    });
  }

  // Get server information
  async getServerInfo(): Promise<any> {
    const request = this.buildRequest("GetServerInfo", [this.hubName]);
    return this.makeRpcCall(request);
  }

  // Get server status
  async getServerStatus(): Promise<any> {
    const request = this.buildRequest("GetServerStatus", [this.hubName]);
    return this.makeRpcCall(request);
  }

  // Create a TCP listener
  async createListener(name: string, port: number, protocol: "tcp" | "udp" = "tcp"): Promise<any> {
    const request = this.buildRequest("CreateListener", [this.hubName, name, port, protocol]);
    return this.makeRpcCall(request);
  }

  // Enumerate listeners
  async enumListeners(): Promise<any> {
    const request = this.buildRequest("EnumListener", [this.hubName]);
    return this.makeRpcCall(request);
  }

  // Delete a listener
  async deleteListener(name: string): Promise<any> {
    const request = this.buildRequest("DeleteListener", [this.hubName, name]);
    return this.makeRpcCall(request);
  }

  // Enable/disable a listener
  async setListenerEnabled(name: string, enabled: boolean): Promise<any> {
    const request = this.buildRequest("EnableListener", [this.hubName, name, enabled ? 1 : 0]);
    return this.makeRpcCall(request);
  }

  // Create a VPN user
  async createUser(username: string, password: string): Promise<any> {
    const request = this.buildRequest("CreateUser", [this.hubName, username, password]);
    return this.makeRpcCall(request);
  }

  // Get user settings
  async getUser(username: string): Promise<any> {
    const request = this.buildRequest("GetUser", [this.hubName, username]);
    return this.makeRpcCall(request);
  }

  // Enumerate users
  async enumUsers(): Promise<any> {
    const request = this.buildRequest("EnumUser", [this.hubName]);
    return this.makeRpcCall(request);
  }

  // Delete a user
  async deleteUser(username: string): Promise<any> {
    const request = this.buildRequest("DeleteUser", [this.hubName, username]);
    return this.makeRpcCall(request);
  }

  // Get list of connected VPN sessions
  async enumSessions(): Promise<any> {
    const request = this.buildRequest("EnumSession", [this.hubName]);
    return this.makeRpcCall(request);
  }

  // Get session status
  async getSessionStatus(sessionId: string): Promise<any> {
    const request = this.buildRequest("GetSessionStatus", [this.hubName, sessionId]);
    return this.makeRpcCall(request);
  }

  // Disconnect a session
  async disconnectSession(sessionId: string): Promise<any> {
    const request = this.buildRequest("DisconnectSession", [this.hubName, sessionId]);
    return this.makeRpcCall(request);
  }

  // Get server version
  async getVersion(): Promise<string> {
    const info = await this.getServerInfo();
    return info?.server_version ?? "Unknown";
  }

  // Check if VPN server is running
  async isRunning(): Promise<boolean> {
    try {
      const status = await this.getServerStatus();
      return status?.status === "running" || status?.status === "started";
    } catch {
      return false;
    }
  }
}

export default SoftetherVpnService;