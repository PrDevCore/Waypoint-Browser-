export type TabType = 'browser' | 'workflow' | 'docs' | 'team' | 'vpn';

export interface VpnLocation {
  id: string;
  country: string;
  city: string;
  flag: string;
  ip: string;
  ping: number;
  load: string;
  /** User-configured SOCKS5/HTTP proxy for this gateway */
  proxyHost?: string;
  proxyPort?: number;
  proxyType?: 'socks5' | 'http';
  proxyUsername?: string;
  proxyPassword?: string;
}

export type VpnStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface VpnState {
  status: VpnStatus;
  activeLocation: VpnLocation | null;
  errorMessage?: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  history: string[];
  historyIndex: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee: {
    name: string;
    avatar?: string;
    role: string;
  };
  dueDate: string;
  vpnRequired: boolean;
  tags: string[];
}

export interface DocItem {
  id: string;
  title: string;
  content: string;
  lastEditedBy: string;
  updatedAt: number;
  category: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  currentActivity: string;
  vpnLocation: string;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: number;
  vpnNode: string;
}

// ---------------------------------------------------------------------------
// Browser settings types
// ---------------------------------------------------------------------------

export type SearchEngineId = 'ddg' | 'google' | 'bing';

export interface SearchEngine {
  id: SearchEngineId;
  label: string;
  url: (q: string) => string;
}

export interface BrowserSettings {
  // General
  searchEngine: SearchEngineId;
  homepage: string;
  newTabPage: 'blank' | 'homepage';
  restoreOnStartup: 'default' | 'previous' | 'homepage';
  // Appearance
  fontSize: 'small' | 'medium' | 'large';
  zoomLevel: number; // default 100
  showBookmarksBar: boolean;
  showHistoryPanel: boolean;
  // Privacy
  clearHistoryOnExit: boolean;
  blockThirdPartyCookies: boolean;
  sendDoNotTrack: boolean;
  // Tabs
  tabPreview: boolean;
  closeLastTabBehavior: 'new-tab' | 'close-window';
  // Advanced
  devToolsEnabled: boolean;
  hardwareAcceleration: boolean;
}

export interface BrowsingData {
  history: boolean;
  cookies: boolean;
  cache: boolean;
  downloads: boolean;
  timeRange: 'past-hour' | 'past-day' | 'past-week' | 'past-month' | 'all-time';
}

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  searchEngine: 'ddg',
  homepage: 'https://duckduckgo.com',
  newTabPage: 'blank',
  restoreOnStartup: 'default',
  fontSize: 'medium',
  zoomLevel: 100,
  showBookmarksBar: true,
  showHistoryPanel: true,
  clearHistoryOnExit: false,
  blockThirdPartyCookies: false,
  sendDoNotTrack: false,
  tabPreview: true,
  closeLastTabBehavior: 'new-tab',
  devToolsEnabled: true,
  hardwareAcceleration: true,
};
