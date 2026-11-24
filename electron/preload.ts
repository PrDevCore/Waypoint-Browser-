import { contextBridge, ipcRenderer } from "electron";

export interface VpnConnectConfig {
  proxyType: "socks5" | "http";
  proxyHost: string;
  proxyPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
}

export interface VpnResult {
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

contextBridge.exposeInMainWorld("electronAPI", {
  getServerPort: (): Promise<number> =>
    ipcRenderer.invoke("get-server-port"),

  vpnConnect: (config: VpnConnectConfig): Promise<VpnResult> =>
    ipcRenderer.invoke("vpn-connect", config),

  vpnDisconnect: (): Promise<VpnResult> =>
    ipcRenderer.invoke("vpn-disconnect"),

  vpnTest: (testUrl: string): Promise<VpnResult> =>
    ipcRenderer.invoke("vpn-test", testUrl),

  loadProxyConfigs: (): Promise<Record<string, VpnConnectConfig>> =>
    ipcRenderer.invoke("proxy-config:load"),

  saveProxyConfig: (locationId: string, config: VpnConnectConfig): Promise<void> =>
    ipcRenderer.invoke("proxy-config:save", locationId, config),

  removeProxyConfig: (locationId: string): Promise<void> =>
    ipcRenderer.invoke("proxy-config:remove", locationId),

  clearBrowserData: (data: { cookies: boolean; cache: boolean }): Promise<void> =>
    ipcRenderer.invoke("browser:clear-site-data", data),

  openDownload: (downloadPath: string): Promise<void> =>
    ipcRenderer.invoke("browser:open-download", downloadPath),

  showDownload: (downloadPath: string): Promise<void> =>
    ipcRenderer.invoke("browser:show-download", downloadPath),

  setBrowserPrivacy: (preferences: { blockThirdPartyCookies: boolean; sendDoNotTrack: boolean }): Promise<void> =>
    ipcRenderer.invoke("browser:set-privacy", preferences),

  onDownloadChanged: (callback: (download: BrowserDownload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, download: BrowserDownload) => callback(download);
    ipcRenderer.on("browser:download", listener);
    return () => ipcRenderer.removeListener("browser:download", listener);
  },

  onOpenUrl: (callback: (url: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on("browser:open-url", listener);
    return () => ipcRenderer.removeListener("browser:open-url", listener);
  },
});
