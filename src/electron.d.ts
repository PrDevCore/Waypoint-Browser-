// Type declarations for the Electron contextBridge API exposed via preload.ts

interface VpnConnectConfig {
  proxyType: 'socks5' | 'http';
  proxyHost: string;
  proxyPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
}

interface VpnResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export interface BrowserDownload {
  id: string;
  filename: string;
  path?: string;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  receivedBytes: number;
  totalBytes: number;
  startedAt: number;
}

interface ElectronAPI {
  getServerPort: () => Promise<number>;
  vpnConnect: (config: VpnConnectConfig) => Promise<VpnResult>;
  vpnDisconnect: () => Promise<VpnResult>;
  vpnTest: (testUrl: string) => Promise<VpnResult>;
  loadProxyConfigs: () => Promise<Record<string, VpnConnectConfig>>;
  saveProxyConfig: (locationId: string, config: VpnConnectConfig) => Promise<void>;
  removeProxyConfig: (locationId: string) => Promise<void>;
  clearBrowserData: (data: { cookies: boolean; cache: boolean }) => Promise<void>;
  openDownload: (downloadPath: string) => Promise<void>;
  showDownload: (downloadPath: string) => Promise<void>;
  setBrowserPrivacy: (preferences: { blockThirdPartyCookies: boolean; sendDoNotTrack: boolean }) => Promise<void>;
  onDownloadChanged: (callback: (download: BrowserDownload) => void) => () => void;
  onOpenUrl: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
