import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BrowserSettings, BrowsingData, VpnLocation } from '../types';
import type { BrowserDownload } from '../electron';
import { BrowserSettings as BrowserSettingsModal, readBrowserSettings } from './BrowserSettings';
import {
  ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, ChevronDown,
  Clock, Download, Globe, Lock, Plus, RotateCw, Search, ShieldAlert,
  ShieldCheck, Star, Trash2, X, AlertTriangle, Settings2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

interface Bookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  addedAt: number;
}

interface HistoryEntry {
  url: string;
  title: string;
  favicon?: string;
  visitedAt: number;
}

type Panel = 'bookmarks' | 'history' | 'downloads' | 'vpn' | null;

const SEARXNG_URL = (import.meta.env.VITE_SEARXNG_URL ?? '').replace(/\/$/, '');

function searxngSearchUrl(q: string, engine?: string): string {
  if (!SEARXNG_URL) {
    // Fallback to direct DuckDuckGo if SearXNG is not configured
    return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  }
  const engineParam = engine ? `&engines=${engine}` : '';
  return `${SEARXNG_URL}/search?q=${encodeURIComponent(q)}&format=html${engineParam}`;
}

const SEARCH_ENGINES = [
  { id: 'ddg', label: 'DuckDuckGo (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'duckduckgo') },
  { id: 'google', label: 'Google (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'google') },
  { id: 'bing', label: 'Bing (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'bing') },
] as const;
type SearchEngineId = (typeof SEARCH_ENGINES)[number]['id'];

const NEW_TAB_URL = 'about:blank';
const HOME_URL = SEARXNG_URL ? `${SEARXNG_URL}/search?q=home&format=html` : 'https://duckduckgo.com';
const LS_BOOKMARKS = 'waypoint.bookmarks';
const LS_HISTORY = 'waypoint.history';
const LS_ENGINE = 'waypoint.engine';
const LS_TABS = 'waypoint.tabs';
const LS_DOWNLOADS = 'waypoint.downloads';
const MAX_HISTORY = 500;
const MAX_DOWNLOADS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function normalizeUrl(input: string, engine: SearchEngineId): string {
  const s = input.trim();
  if (!s) return HOME_URL;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) return 'https://' + s;
  const q = encodeURIComponent(s);
  const eng = SEARCH_ENGINES.find(e => e.id === engine) ?? SEARCH_ENGINES[0];
  return eng.url(q);
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function faviconFor(url: string): string {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function readLS<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function writeLS(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function makeTab(url = HOME_URL): Tab {
  return { id: uid(), url, title: url === NEW_TAB_URL ? 'New tab' : url, isLoading: false, canGoBack: false, canGoForward: false };
}

function readStartupTabs(settings: BrowserSettings): { tabs: Tab[]; activeId: string } {
  if (settings.restoreOnStartup === 'previous') {
    const saved = readLS<{ tabs?: unknown; activeId?: unknown }>(LS_TABS, {});
    if (Array.isArray(saved.tabs)) {
      const restored = saved.tabs
        .filter((tab): tab is Tab => Boolean(tab && typeof tab === 'object' && typeof (tab as Tab).id === 'string' && typeof (tab as Tab).url === 'string' && (isWebUrl((tab as Tab).url) || (tab as Tab).url === NEW_TAB_URL)))
        .map(tab => ({ ...tab, isLoading: false, canGoBack: false, canGoForward: false }));
      if (restored.length) {
        return { tabs: restored, activeId: restored.some(tab => tab.id === saved.activeId) ? String(saved.activeId) : restored[0].id };
      }
    }
  }
  const url = settings.restoreOnStartup === 'homepage' || settings.newTabPage === 'homepage'
    ? settings.homepage
    : NEW_TAB_URL;
  const tab = makeTab(url);
  return { tabs: [tab], activeId: tab.id };
}

// ---------------------------------------------------------------------------
// NewTabPage shown when url === about:blank
// ---------------------------------------------------------------------------
function NewTabPage({ bookmarks, onNavigate }: { bookmarks: Bookmark[]; onNavigate: (url: string) => void }) {
  const [q, setQ] = useState('');
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-950 gap-8 p-8">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">New Tab</h1>
      <form
        onSubmit={e => { e.preventDefault(); if (q.trim()) onNavigate(q); }}
        className="flex items-center gap-2 w-full max-w-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 shadow-sm focus-within:border-brand-500"
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search or enter address…"
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
        />
      </form>
      {bookmarks.length > 0 && (
        <div className="w-full max-w-xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Bookmarks</p>
          <div className="grid grid-cols-4 gap-3">
            {bookmarks.slice(0, 8).map(bm => (
              <button
                key={bm.id}
                onClick={() => onNavigate(bm.url)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 transition-colors text-center"
              >
                <img src={bm.favicon || faviconFor(bm.url)} className="w-6 h-6 rounded" onError={e => (e.currentTarget.style.display = 'none')} alt="" />
                <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate w-full">{bm.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface BrowserViewProps {
  vpnEnabled: boolean;
  setVpnEnabled: (v: boolean) => void;
  vpnLocations: VpnLocation[];
  activeVpnLocation: VpnLocation | null;
  setActiveVpnLocation: (loc: VpnLocation) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export const BrowserView: React.FC<BrowserViewProps> = ({
  vpnEnabled, setVpnEnabled, vpnLocations, activeVpnLocation, setActiveVpnLocation,
}) => {
  const [browserSettings, setBrowserSettings] = useState<BrowserSettings>(() => readBrowserSettings());
  const [startup] = useState(() => readStartupTabs(browserSettings));
  const [tabs, setTabs] = useState<Tab[]>(() => startup.tabs);
  const [activeId, setActiveId] = useState<string>(() => startup.activeId);
  const activeTab = tabs.find(t => t.id === activeId) ?? tabs[0];

  const [urlInput, setUrlInput] = useState(HOME_URL);
  const [urlFocused, setUrlFocused] = useState(false);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => readLS(LS_BOOKMARKS, []));
  const [history, setHistory] = useState<HistoryEntry[]>(() => readLS(LS_HISTORY, []));
  const [downloads, setDownloads] = useState<BrowserDownload[]>(() => readLS<BrowserDownload[]>(LS_DOWNLOADS, []).map(download => download.state === 'progressing' ? { ...download, state: 'interrupted' } : download));
  const [engine, setEngine] = useState<SearchEngineId>(() => browserSettings.searchEngine);

  const [panel, setPanel] = useState<Panel>(null);
  const [historyFilter, setHistoryFilter] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isDesktopApp = Boolean(window.electronAPI);
  const webviewRefs = useRef<Record<string, Electron.WebviewTag | null>>({});
  const webviewReady = useRef<Record<string, boolean>>({});
  const webviewCleanups = useRef<Record<string, () => void>>({});
  const wv = useCallback(() => webviewRefs.current[activeId] ?? null, [activeId]);

  const openExternal = useCallback(async (url: string) => {
    // Prefer Capacitor Browser API on mobile (Android/iOS WebView)
    const capBrowser = (window as any).Capacitor?.Plugins?.Browser;
    if (capBrowser) {
      try {
        await capBrowser.open({ url });
        return;
      } catch {
        // fall through to window.open
      }
    }
    const openedWindow = window.open(url, '_blank');
    if (openedWindow) openedWindow.opener = null;
    else setLoadError(`Your browser blocked opening ${url}. Allow pop-ups and try again.`);
  }, []);

  const safeSetZoomFactor = useCallback((webview: Electron.WebviewTag | null, zoomFactor: number) => {
    if (!webview) return;
    try {
      webview.setZoomFactor(zoomFactor);
    } catch (error) {
      if (String(error).includes('dom-ready')) return;
      throw error;
    }
  }, []);

  useEffect(() => { writeLS(LS_BOOKMARKS, bookmarks); }, [bookmarks]);
  useEffect(() => { writeLS(LS_HISTORY, history); }, [history]);
  useEffect(() => { writeLS(LS_ENGINE, engine); }, [engine]);
  useEffect(() => { writeLS(LS_TABS, { tabs, activeId }); }, [tabs, activeId]);
  useEffect(() => { writeLS(LS_DOWNLOADS, downloads); }, [downloads]);

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onDownloadChanged(download => {
      setDownloads(current => {
        const existing = current.find(item => item.id === download.id);
        const stableDownload = { ...download, startedAt: existing?.startedAt ?? download.startedAt };
        return [stableDownload, ...current.filter(item => item.id !== download.id)].slice(0, MAX_DOWNLOADS);
      });
    });
  }, []);

  useEffect(() => {
    setEngine(browserSettings.searchEngine);
    if (window.electronAPI) {
      window.electronAPI.setBrowserPrivacy({
        blockThirdPartyCookies: browserSettings.blockThirdPartyCookies,
        sendDoNotTrack: browserSettings.sendDoNotTrack,
      }).catch(error => setLoadError(`Could not apply privacy settings: ${String(error)}`));
    }
    const fontScale = browserSettings.fontSize === 'small' ? 0.875 : browserSettings.fontSize === 'large' ? 1.125 : 1;
    const zoomFactor = browserSettings.zoomLevel / 100 * fontScale;
    Object.entries(webviewRefs.current).forEach(([tabId, webview]) => {
      if (webviewReady.current[tabId]) safeSetZoomFactor(webview, zoomFactor);
    });
  }, [browserSettings]);

  useEffect(() => {
    if (!browserSettings.clearHistoryOnExit) return;
    const clearHistory = () => localStorage.removeItem(LS_HISTORY);
    window.addEventListener('beforeunload', clearHistory);
    return () => window.removeEventListener('beforeunload', clearHistory);
  }, [browserSettings.clearHistoryOnExit]);

  useEffect(() => {
    if (!urlFocused) setUrlInput(activeTab.url === NEW_TAB_URL ? '' : activeTab.url);
  }, [activeId, activeTab.url, urlFocused]);

  useEffect(() => {
    if (!browserSettings.showHistoryPanel && panel === 'history') setPanel(null);
  }, [browserSettings.showHistoryPanel, panel]);

  const wireWebview = useCallback((tabId: string, el: Electron.WebviewTag | null) => {
    if (!el) {
      webviewCleanups.current[tabId]?.();
      delete webviewCleanups.current[tabId];
      delete webviewRefs.current[tabId];
      delete webviewReady.current[tabId];
      return;
    }
    webviewRefs.current[tabId] = el;

    const update = (patch: Partial<Tab>) =>
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...patch } : t));
    const applyZoom = () => {
      webviewReady.current[tabId] = true;
      const fontScale = browserSettings.fontSize === 'small' ? 0.875 : browserSettings.fontSize === 'large' ? 1.125 : 1;
      safeSetZoomFactor(el, browserSettings.zoomLevel / 100 * fontScale);
    };

    const onNavigate = (e: Event) => {
      const url = (e as any).url as string;
      if (!url || url === NEW_TAB_URL) return;
      const canGoBack = el.canGoBack?.() ?? false;
      const canGoForward = el.canGoForward?.() ?? false;
      update({ url, canGoBack, canGoForward });
      if (tabId === activeId) setUrlInput(url);
      setHistory(prev => {
        const entry: HistoryEntry = { url, title: url, favicon: faviconFor(url), visitedAt: Date.now() };
        return [entry, ...prev].slice(0, MAX_HISTORY);
      });
    };

    const onTitle = (e: Event) => {
      const title = (e as any).title as string;
      if (title) {
        update({ title });
        setHistory(prev => prev.map((h, i) => i === 0 && h.url === el.getURL?.() ? { ...h, title } : h));
      }
    };

    const onFavicon = (e: Event) => {
      const favicons: string[] = (e as any).favicons ?? [];
      const favicon = favicons[0];
      if (favicon) {
        update({ favicon });
        setHistory(prev => prev.map((h, i) => i === 0 ? { ...h, favicon } : h));
      }
    };

    const onLoadStart = () => {
      update({ isLoading: true });
      setLoadError(null);
    };
    const onLoadStop = () => {
      const canGoBack = el.canGoBack?.() ?? false;
      const canGoForward = el.canGoForward?.() ?? false;
      update({ isLoading: false, canGoBack, canGoForward });
      setLoadError(null);
    };
    const onLoadFailed = (e: Event) => {
      const errorDesc = (e as any).errorDescription || (e as any).errorCode || 'failed to load';
      const failedUrl = (e as any).url || activeTab.url;
      update({ isLoading: false });
      setLoadError(`Unable to load ${failedUrl}: ${errorDesc}`);
    };

    el.addEventListener('did-navigate', onNavigate);
    el.addEventListener('did-fail-load', onLoadFailed);
    el.addEventListener('did-navigate-in-page', onNavigate);
    el.addEventListener('page-title-updated', onTitle);
    el.addEventListener('page-favicon-updated', onFavicon);
    el.addEventListener('did-start-loading', onLoadStart);
    el.addEventListener('did-stop-loading', onLoadStop);
    el.addEventListener('dom-ready', applyZoom);
    webviewCleanups.current[tabId] = () => {
      el.removeEventListener('did-navigate', onNavigate);
      el.removeEventListener('did-fail-load', onLoadFailed);
      el.removeEventListener('did-navigate-in-page', onNavigate);
      el.removeEventListener('page-title-updated', onTitle);
      el.removeEventListener('page-favicon-updated', onFavicon);
      el.removeEventListener('did-start-loading', onLoadStart);
      el.removeEventListener('did-stop-loading', onLoadStop);
      el.removeEventListener('dom-ready', applyZoom);
    };
  }, [activeId, activeTab.url, browserSettings.zoomLevel, browserSettings.fontSize, safeSetZoomFactor]);

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw, engine);
    setLoadError(null);
    setIframeBlocked(null);
    if (isDesktopApp) {
      const webview = wv();
      if (typeof webview?.loadURL === 'function') webview.loadURL(url);
    }
    // On mobile (Capacitor), the iframe below re-renders with the new src —
    // no window.open needed for embedded browsing.
    setUrlInput(url);
    setTabs(prev => prev.map(t => t.id === activeId
      ? { ...t, url, title: isDesktopApp ? t.title : url, favicon: isDesktopApp ? t.favicon : faviconFor(url), isLoading: isDesktopApp }
      : t));
    if (!isDesktopApp) {
      setHistory(prev => [{ url, title: url, favicon: faviconFor(url), visitedAt: Date.now() }, ...prev].slice(0, MAX_HISTORY));
    }
    setPanel(null);
  }, [engine, activeId, wv, isDesktopApp]);

  // Detect CSP frame-ancestors violations (e.g., DuckDuckGo blocking framing)
  // iframe onError doesn't fire reliably for CSP violations in all browsers,
  // so this document-level listener is the backup.
  useEffect(() => {
    const onSecurityPolicyViolation = (e: SecurityPolicyViolationEvent) => {
      if (e.violatedDirective === 'frame-ancestors' && e.blockedURI) {
        setIframeBlocked(e.blockedURI);
      }
    };
    document.addEventListener('securitypolicyviolation', onSecurityPolicyViolation);
    return () => {
      document.removeEventListener('securitypolicyviolation', onSecurityPolicyViolation);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); navigate(urlInput); };

  const addTab = (url = browserSettings.newTabPage === 'homepage' ? browserSettings.homepage : NEW_TAB_URL) => {
    const t = makeTab(url);
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
    setUrlInput(url === NEW_TAB_URL ? '' : url);
    setPanel(null);
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    return window.electronAPI.onOpenUrl(url => {
      if (isWebUrl(url)) addTab(url);
    });
  }, [browserSettings.newTabPage, browserSettings.homepage]);

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      if (browserSettings.closeLastTabBehavior === 'close-window') {
        window.close();
        return;
      }
      addTab();
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) {
        const idx = prev.findIndex(t => t.id === id);
        const fallback = next[Math.min(idx, next.length - 1)];
        setActiveId(fallback.id);
        setUrlInput(fallback.url === NEW_TAB_URL ? '' : fallback.url);
      }
      return next;
    });
    delete webviewRefs.current[id];
    delete webviewReady.current[id];
  };

  const switchTab = (id: string) => {
    setActiveId(id);
    const t = tabs.find(t => t.id === id);
    if (t) setUrlInput(t.url === NEW_TAB_URL ? '' : t.url);
    setPanel(null);
  };

  const isBookmarked = bookmarks.some(b => b.url === activeTab.url);

  const toggleBookmark = () => {
    if (isBookmarked) {
      setBookmarks(prev => prev.filter(b => b.url !== activeTab.url));
    } else {
      setBookmarks(prev => [{
        id: uid(), url: activeTab.url, title: activeTab.title,
        favicon: activeTab.favicon, addedAt: Date.now(),
      }, ...prev]);
    }
  };

  const removeBookmark = (id: string) => setBookmarks(prev => prev.filter(b => b.id !== id));

  const filteredHistory = historyFilter
    ? history.filter(h => h.url.includes(historyFilter) || h.title.toLowerCase().includes(historyFilter.toLowerCase()))
    : history;

  const togglePanel = (p: Panel) => setPanel(prev => prev === p ? null : p);
  const isHttps = activeTab.url.startsWith('https://');
  const isNewTab = activeTab.url === NEW_TAB_URL;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
        {/* Tab bar */}
        <div className="flex items-center gap-0.5 px-3 pt-2 bg-slate-200/80 dark:bg-slate-900/90 border-b border-slate-300 dark:border-slate-800 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 mr-3 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-emerald-400 hover:bg-emerald-500 cursor-pointer" />
          </div>

          <div className="flex items-end gap-0.5 flex-1 overflow-x-auto">
            {tabs.map(tab => {
              const active = tab.id === activeId;
              return (
                <div
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  role="tab"
                  aria-selected={active}
                  title={browserSettings.tabPreview ? tab.title : undefined}
                  className={`group relative flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-t-lg text-xs font-medium cursor-pointer transition-all shrink-0 max-w-[200px] min-w-[120px] ${
                    active
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm z-10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-300/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {tab.isLoading ? (
                    <RotateCw className="w-3 h-3 shrink-0 animate-spin text-brand-500" />
                  ) : tab.favicon ? (
                    <img src={tab.favicon} className="w-3.5 h-3.5 shrink-0 rounded-sm" onError={e => (e.currentTarget.style.display='none')} alt="" />
                  ) : (
                    <Globe className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-brand-500' : 'text-slate-400'}`} />
                  )}
                  <span className="truncate flex-1">{tab.title}</span>
                  <button
                    onClick={e => closeTab(e, tab.id)}
                    aria-label="Close tab"
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-t" />}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => addTab()}
            aria-label="New tab"
            className="p-1.5 ml-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-300/60 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => {
                const webview = wv();
                if (typeof webview?.goBack === 'function') webview.goBack();
              }}
              disabled={!activeTab.canGoBack}
              aria-label="Back"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const webview = wv();
                if (typeof webview?.goForward === 'function') webview.goForward();
              }}
              disabled={!activeTab.canGoForward}
              aria-label="Forward"
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const webview = wv();
                if (activeTab.isLoading) {
                  if (typeof webview?.stop === 'function') webview.stop();
                } else if (typeof webview?.reload === 'function') {
                  webview.reload();
                } else if (!isDesktopApp) {
                  // On mobile, increment reloadKey to force iframe re-mount
                  setReloadKey(k => k + 1);
                }
              }}
              aria-label={isDesktopApp ? (activeTab.isLoading ? 'Stop' : 'Reload') : 'Open in browser'}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDesktopApp && activeTab.isLoading
                ? <X className="w-4 h-4 text-slate-500" />
                : isDesktopApp
                  ? <RotateCw className="w-4 h-4" />
                  : <Globe className="w-4 h-4" />}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-transparent focus-within:border-brand-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all min-w-0">
            <span className="shrink-0">
              {isNewTab ? (
                <Search className="w-3.5 h-3.5 text-slate-400" />
              ) : isHttps ? (
                <Lock className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              )}
            </span>
            <input
              type="text"
              value={urlFocused ? urlInput : (isNewTab ? '' : urlInput)}
              onChange={e => setUrlInput(e.target.value)}
              onFocus={e => { setUrlFocused(true); e.currentTarget.select(); }}
              onBlur={() => setUrlFocused(false)}
              placeholder="Search or enter address…"
              aria-label="Address bar"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 focus:outline-none min-w-0"
            />
            {urlInput && urlFocused && (
              <button type="button" onMouseDown={e => { e.preventDefault(); setUrlInput(''); }} className="shrink-0 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <button
            onClick={toggleBookmark}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${isBookmarked ? 'text-amber-500 hover:text-amber-600' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>

          <button
            onClick={() => togglePanel('bookmarks')}
            aria-label="Bookmarks"
            title="Bookmarks"
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${panel === 'bookmarks' ? 'bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <Star className="w-4 h-4" />
          </button>

          {browserSettings.showHistoryPanel && (
            <button
              onClick={() => togglePanel('history')}
              aria-label="History"
              title="History"
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${panel === 'history' ? 'bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Clock className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => togglePanel('downloads')}
            aria-label="Downloads"
            title="Downloads"
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${panel === 'downloads' ? 'bg-brand-100 dark:bg-brand-950 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <Download className="w-4 h-4" />
          </button>

          <select
            value={engine}
            onChange={e => {
              const searchEngine = e.target.value as SearchEngineId;
              setEngine(searchEngine);
              setBrowserSettings(current => ({ ...current, searchEngine }));
            }}
            aria-label="Search engine"
            className="hidden lg:block px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 shrink-0"
          >
            {SEARCH_ENGINES.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>

          <button
            onClick={() => vpnEnabled ? setVpnEnabled(false) : setPanel('vpn')}
            title={vpnEnabled ? 'Disconnect browser proxy' : 'Choose a proxy gateway'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${vpnEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            {vpnEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{vpnEnabled ? activeVpnLocation?.city ?? 'PROXY ON' : 'PROXY OFF'}</span>
          </button>

          <button
            onClick={() => togglePanel('vpn')}
            aria-label="Select proxy gateway"
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${panel === 'vpn' ? 'bg-brand-100 dark:bg-brand-950 text-brand-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Browser settings"
            className="p-1.5 rounded-lg transition-colors shrink-0 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {/* Panels */}
        {panel !== null && (
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-lg shrink-0 max-h-80 overflow-y-auto">
            {panel === 'bookmarks' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Bookmarks</span>
                  <button onClick={() => setPanel(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
                {bookmarks.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No bookmarks yet. Click the bookmark icon to save a page.</p>
                ) : (
                  <div className="space-y-0.5">
                    {bookmarks.map(bm => (
                      <div key={bm.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        <img src={bm.favicon || faviconFor(bm.url)} className="w-4 h-4 shrink-0 rounded-sm" onError={e => (e.currentTarget.style.display='none')} alt="" />
                        <button
                          onClick={() => { navigate(bm.url); setPanel(null); }}
                          className="flex-1 text-left text-xs text-slate-800 dark:text-slate-200 truncate hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          <span className="font-medium">{bm.title}</span>
                          <span className="ml-2 text-slate-400 text-[10px] font-mono">{bm.url}</span>
                        </button>
                        <button onClick={() => removeBookmark(bm.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {panel === 'downloads' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Downloads</span>
                  {downloads.length > 0 && <button onClick={() => setDownloads([])} className="text-xs text-red-500 hover:text-red-600">Clear history</button>}
                </div>
                {downloads.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No downloads yet.</p>
                ) : (
                  <div className="space-y-1">
                    {downloads.map(download => (
                      <div key={download.id} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                        <Download className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{download.filename}</p>
                          <p className="text-[10px] text-slate-500 truncate">{download.state === 'progressing' ? `${Math.round(download.receivedBytes / Math.max(download.totalBytes, 1) * 100)}%` : download.state}</p>
                        </div>
                        {download.state === 'completed' && download.path && window.electronAPI && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => window.electronAPI?.openDownload(download.path!).catch(error => setLoadError(`Could not open download: ${String(error)}`))}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            >
                              Open
                            </button>
                            <button
                              onClick={() => window.electronAPI?.showDownload(download.path!).catch(error => setLoadError(`Could not reveal download: ${String(error)}`))}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                              Show
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {panel === 'history' && browserSettings.showHistoryPanel && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">History</span>
                  <div className="flex items-center gap-2 flex-1">
                    <div className="flex items-center gap-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1">
                      <Search className="w-3 h-3 text-slate-400 shrink-0" />
                      <input
                        autoFocus
                        value={historyFilter}
                        onChange={e => setHistoryFilter(e.target.value)}
                        placeholder="Filter history…"
                        className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
                      />
                    </div>
                    {history.length > 0 && (
                      <button
                        onClick={() => { setHistory([]); }}
                        className="text-xs text-red-500 hover:text-red-600 whitespace-nowrap shrink-0"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <button onClick={() => setPanel(null)} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-4 h-4" /></button>
                </div>
                {filteredHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No history{historyFilter ? ' matching your filter' : ' yet'}.</p>
                ) : (
                  <div className="space-y-0.5">
                    {filteredHistory.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                        <img src={h.favicon || faviconFor(h.url)} className="w-4 h-4 shrink-0 rounded-sm" onError={e => (e.currentTarget.style.display='none')} alt="" />
                        <button
                          onClick={() => { navigate(h.url); setPanel(null); }}
                          className="flex-1 text-left text-xs text-slate-800 dark:text-slate-200 truncate hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          <span className="font-medium">{h.title}</span>
                          <span className="ml-2 text-slate-400 text-[10px] font-mono truncate">{h.url}</span>
                        </button>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{formatTime(h.visitedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {panel === 'vpn' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">VPN Gateway (simulation)</span>
                  <button onClick={() => setPanel(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {vpnLocations.map(loc => {
                    const selected = activeVpnLocation?.id === loc.id && vpnEnabled;
                    return (
                      <button
                        key={loc.id}
                        onClick={() => { setActiveVpnLocation(loc); setVpnEnabled(true); setPanel(null); }}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors text-xs ${selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        <span className="text-lg">{loc.flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">{loc.city}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{loc.ping}ms · {loc.load}</div>
                        </div>
                        {selected && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {browserSettings.showBookmarksBar && bookmarks.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shrink-0">
            {bookmarks.slice(0, 12).map(bookmark => (
              <button key={bookmark.id} onClick={() => navigate(bookmark.url)} className="max-w-40 shrink-0 px-2 py-1 rounded-md text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 truncate">
                {bookmark.title}
              </button>
            ))}
          </div>
        )}

        {/* Webview area */}
        <div className="flex-1 relative overflow-hidden bg-white dark:bg-slate-950">
          {loadError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
              <div className="max-w-lg text-center">
                <AlertTriangle className="w-6 h-6 mb-2 text-amber-500" />
                <h3 className="text-sm font-semibold mb-1">Couldn't load page</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{loadError}</p>
                <button
                  onClick={() => setLoadError(null)}
                  className="mt-3 text-xs underline text-brand-600 hover:text-brand-500"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {iframeBlocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
              <div className="max-w-lg text-center">
                <AlertTriangle className="w-6 h-6 mb-2 text-amber-500" />
                <h3 className="text-sm font-semibold mb-1">This site can't be embedded</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words mb-4">
                  {iframeBlocked} blocks embedding in another page (X-Frame-Options).
                </p>
                <button
                  onClick={() => { openExternal(iframeBlocked!); setIframeBlocked(null); }}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500"
                >
                  Open in external browser
                </button>
                <button
                  onClick={() => setIframeBlocked(null)}
                  className="mt-3 text-xs underline text-brand-600 hover:text-brand-500"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === activeId ? 'block' : 'hidden'}`}
            >
              {tab.url === NEW_TAB_URL ? (
                <NewTabPage bookmarks={bookmarks} onNavigate={url => { navigate(url); }} />
              ) : isDesktopApp ? (
                <webview
                  ref={el => wireWebview(tab.id, el as unknown as Electron.WebviewTag | null)}
                  src={tab.url}
                  partition="persist:waypoint-browser"
                  className="w-full h-full border-0"
                  allowpopups={true}
                />
              ) : (
                // MOBILE: Load URL inside an iframe within the Capacitor WebView
                <iframe
                  key={`${tab.id}-${reloadKey}`}
                  className="w-full h-full border-0"
                  src={tab.url}
                  title={tab.title}
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="camera *; microphone *; geolocation *"
                  loading="eager"
                  onError={() => {
                    setIframeBlocked(tab.url);
                    setLoadError(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <BrowserSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settingsValue={browserSettings}
        onSettingsChange={setBrowserSettings}
        onClearData={async (data) => {
          const durations: Record<BrowsingData['timeRange'], number> = {
            'past-hour': 60 * 60 * 1000,
            'past-day': 24 * 60 * 60 * 1000,
            'past-week': 7 * 24 * 60 * 60 * 1000,
            'past-month': 30 * 24 * 60 * 60 * 1000,
            'all-time': Number.POSITIVE_INFINITY,
          };
          const isAllTime = data.timeRange === 'all-time';
          const cutoff = isAllTime ? 0 : Date.now() - durations[data.timeRange];
          if (data.history) setHistory(current => current.filter(entry => !isAllTime && entry.visitedAt < cutoff));
          if (data.downloads) setDownloads(current => current.filter(download => !isAllTime && download.startedAt < cutoff));
          if (data.cookies || data.cache) {
            if (!window.electronAPI) throw new Error('Clearing site cookies and cache is available in the desktop app.');
            await window.electronAPI.clearBrowserData({ cookies: data.cookies, cache: data.cache });
          }
        }}
      />
    </>
  );
};