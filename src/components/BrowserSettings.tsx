import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Settings2,
  X,
  Search,
  Home,
  Monitor,
  Palette,
  Shield,
  ShieldAlert,
  ShieldOff,
  Trash2,
  Clock,
  RotateCw,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Loader2,
  Info,
  Globe,
  LayoutGrid,
  Pin,
  EyeOff,
  FileText,
} from 'lucide-react';
import type { BrowserSettings as BrowserSettingsType, BrowsingData, SearchEngine } from '../types';
import { DEFAULT_BROWSER_SETTINGS } from '../types';
import { isElectron } from '../lib/vpn';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LS_SETTINGS = 'waypoint.browser.settings';
const LS_BROWSING_DATA = 'waypoint.browsing.data';

const SEARXNG_URL = (import.meta.env.VITE_SEARXNG_URL ?? '').replace(/\/$/, '');

function searxngSearchUrl(q: string, engine?: string): string {
  if (!SEARXNG_URL) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  }
  const engineParam = engine ? `&engines=${engine}` : '';
  return `${SEARXNG_URL}/search?q=${encodeURIComponent(q)}&format=html${engineParam}`;
}

const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'ddg', label: 'DuckDuckGo (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'duckduckgo') },
  { id: 'google', label: 'Google (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'google') },
  { id: 'bing', label: 'Bing (SearXNG)', url: (q: string) => searxngSearchUrl(q, 'bing') },
];

const FONT_SIZES = [
  { id: 'small' as const, label: 'Small', rem: 0.875 },
  { id: 'medium' as const, label: 'Medium', rem: 1 },
  { id: 'large' as const, label: 'Large', rem: 1.125 },
];

const TIME_RANGES = [
  { id: 'past-hour' as const, label: 'Past hour' },
  { id: 'past-day' as const, label: 'Past day' },
  { id: 'past-week' as const, label: 'Past week' },
  { id: 'past-month' as const, label: 'Past month' },
  { id: 'all-time' as const, label: 'All time' },
];

const APP_NAME = 'Waypoint Browser';
const APP_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function readBrowserSettings(): BrowserSettingsType {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (!raw) return { ...DEFAULT_BROWSER_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_BROWSER_SETTINGS };
    const settings = { ...DEFAULT_BROWSER_SETTINGS, ...(parsed as Partial<BrowserSettingsType>) };
    const homepage = new URL(settings.homepage);
    if (homepage.protocol !== 'http:' && homepage.protocol !== 'https:') settings.homepage = DEFAULT_BROWSER_SETTINGS.homepage;
    if (!['ddg', 'google', 'bing'].includes(settings.searchEngine)) settings.searchEngine = DEFAULT_BROWSER_SETTINGS.searchEngine;
    if (!Number.isFinite(settings.zoomLevel) || settings.zoomLevel < 50 || settings.zoomLevel > 200) settings.zoomLevel = DEFAULT_BROWSER_SETTINGS.zoomLevel;
    return settings;
  } catch {
    return { ...DEFAULT_BROWSER_SETTINGS };
  }
}

function writeSettings(settings: Partial<BrowserSettingsType>): void {
  try {
    const current = readBrowserSettings();
    const next = { ...current, ...settings };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next));
  } catch {
    // Ignore quota/access errors
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingSection = 'general' | 'appearance' | 'privacy' | 'vpn' | 'tabs' | 'about';

interface SectionButtonProps {
  id: SettingSection;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function SectionButton({ id, label, icon, active, onClick }: SectionButtonProps) {
  return (
    <button
      key={id}
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left transition-all text-sm font-medium shrink-0 ${
        active
          ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 shadow-sm border-r border-brand-200 dark:border-brand-900'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <div className={`w-5 h-5 shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`}>{icon}</div>
      <span>{label}</span>
    </button>
  );
}

// ── General ────────────────────────────────────────────────────────────────

interface GeneralProps {
  settings: BrowserSettingsType;
  onUpdate: (next: Partial<BrowserSettingsType>) => void;
}

function General({ settings, onUpdate }: GeneralProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">General</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure how the browser behaves on startup and for new tabs.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Default search engine
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SEARCH_ENGINES.map((engine) => {
              const selected = settings.searchEngine === engine.id;
              return (
                <button
                  key={engine.id}
                  onClick={() => onUpdate({ searchEngine: engine.id })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-pointer transition-all ${
                    selected
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <Globe className={`w-5 h-5 ${selected ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-medium ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                    {engine.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Homepage
          </label>
          <input
            type="url"
            value={settings.homepage}
            onChange={(e) => onUpdate({ homepage: e.target.value })}
            placeholder="https://example.com"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            New tab page
          </label>
          <div className="space-y-2">
            {[
              { id: 'blank' as const, label: 'Blank page' },
              { id: 'homepage' as const, label: 'Your homepage' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onUpdate({ newTabPage: opt.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                  settings.newTabPage === opt.id
                    ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Home className={`w-4 h-4 shrink-0 ${settings.newTabPage === opt.id ? 'text-brand-600' : 'text-slate-400'}`} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            On startup
          </label>
          <div className="space-y-2">
            {[
              { id: 'default' as const, label: 'Open the new tab page' },
              { id: 'previous' as const, label: 'Continue where you left off' },
              { id: 'homepage' as const, label: 'Open the homepage' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onUpdate({ restoreOnStartup: opt.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                  settings.restoreOnStartup === opt.id
                    ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <RotateCw className={`w-4 h-4 shrink-0 ${settings.restoreOnStartup === opt.id ? 'text-brand-600' : 'text-slate-400'}`} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Appearance ─────────────────────────────────────────────────────────────

interface AppearanceProps {
  settings: BrowserSettingsType;
  onUpdate: (next: Partial<BrowserSettingsType>) => void;
}

function Appearance({ settings, onUpdate }: AppearanceProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Appearance</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Customize the look and feel of the browser UI.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Font size
          </label>
          <div className="flex items-center gap-3">
            {FONT_SIZES.map((size) => (
              <button
                key={size.id}
                onClick={() => onUpdate({ fontSize: size.id })}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                  settings.fontSize === size.id
                    ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span style={{ fontSize: size.rem }}>{size.label}</span>
                {settings.fontSize === size.id && <Check className="w-3 h-3 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Page zoom
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onUpdate({ zoomLevel: Math.max(50, settings.zoomLevel - 10) })}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              disabled={settings.zoomLevel <= 50}
            >
              <MinusIcon className="w-4 h-4" />
            </button>
            <span className="w-8 text-center text-sm font-mono text-slate-700 dark:text-slate-300">
              {settings.zoomLevel}%
            </span>
            <button
              onClick={() => onUpdate({ zoomLevel: Math.min(200, settings.zoomLevel + 10) })}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
              disabled={settings.zoomLevel >= 200}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Zoom affects web page content, not browser UI.
          </p>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <Pin className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white">Show bookmarks bar</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Always display bookmarks below the URL bar.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.showBookmarksBar}
            onChange={(e) => onUpdate({ showBookmarksBar: e.target.checked })}
            className="rounded-md text-brand-600 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white">Show history panel</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Enable browsing history search and navigation.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.showHistoryPanel}
            onChange={(e) => onUpdate({ showHistoryPanel: e.target.checked })}
            className="rounded-md text-brand-600 focus:ring-brand-500"
          />
        </div>
      </div>
    </div>
  );
}

// ── Privacy ────────────────────────────────────────────────────────────────

interface PrivacyProps {
  settings: BrowserSettingsType;
  onUpdate: (next: Partial<BrowserSettingsType>) => void;
  onClearData: (data: BrowsingData) => Promise<void>;
}

function Privacy({ settings, onUpdate, onClearData }: PrivacyProps) {
  const [clearModal, setClearModal] = useState<boolean>(false);
  const [dataSelection, setDataSelection] = useState<BrowsingData>({
    history: true,
    cookies: false,
    cache: true,
    downloads: false,
    timeRange: 'all-time',
  });
  const [clearing, setClearing] = useState<boolean>(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const toggleDataItem = (key: keyof BrowsingData) => {
    setDataSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClear = async () => {
    setClearing(true);
    setClearError(null);
    try {
      await onClearData(dataSelection);
      setClearModal(false);
    } catch (error) {
      setClearError(error instanceof Error ? error.message : String(error));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Privacy &amp; Security</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage cookies, tracking, and browsing data.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white">Clear browsing data</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Remove history, cookies, cache, and other site data.
                </p>
              </div>
            </div>
            <button
              onClick={() => setClearModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear data
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Clear history on exit</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Automatically clear browsing history when the browser closes.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.clearHistoryOnExit}
                onChange={(e) => onUpdate({ clearHistoryOnExit: e.target.checked })}
                className="rounded-md text-brand-600 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center gap-3">
                <ShieldOff className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Block cross-origin cookies</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Strip cookies when a cross-origin request includes a different referrer.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.blockThirdPartyCookies}
                onChange={(e) => onUpdate({ blockThirdPartyCookies: e.target.checked })}
                className="rounded-md text-brand-600 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-800/30">
              <div className="flex items-center gap-3">
                <EyeOff className="w-4 h-4 text-slate-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white">Send "Do Not Track" requests</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Ask websites not to track your browsing activity.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.sendDoNotTrack}
                onChange={(e) => onUpdate({ sendDoNotTrack: e.target.checked })}
                className="rounded-md text-brand-600 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>
        {/* Clear browsing data modal */}
        {clearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Clear browsing data</h3>
                </div>
                <button onClick={() => setClearModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {clearError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{clearError}</p>}
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Select what to clear and the time range:
                </p>

                <div className="space-y-3">
                  {[
                    { key: 'history', label: 'Browsing history', icon: <Clock className="w-4 h-4" />, desc: 'Visited pages' },
                    { key: 'cookies', label: 'Cookies and site data', icon: <Shield className="w-4 h-4" />, desc: 'Site cookies and local storage' },
                    { key: 'cache', label: 'Cached images and files', icon: <Monitor className="w-4 h-4" />, desc: 'Cached web resources' },
                    { key: 'downloads', label: 'Download history', icon: <FileText className="w-4 h-4" />, desc: 'Download list (files are not deleted)' },
                  ].map(({ key, label, icon, desc }) => (
                      <div
                      key={key}
                      onClick={() => toggleDataItem(key as keyof BrowsingData)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        dataSelection[key as keyof BrowsingData]
                          ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${dataSelection[key as keyof BrowsingData] ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                          {dataSelection[key as keyof BrowsingData] ? <Check className="w-3 h-3" /> : icon}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-900 dark:text-white">{label}</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Waypoint does not manage saved passwords or autofill data. Clearing cookies/site data or cache removes all matching data, regardless of the selected time range.</p>

                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Time range</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TIME_RANGES.map((range) => {
                      const selected = dataSelection.timeRange === range.id;
                      return (
                        <button
                          key={range.id}
                          onClick={() => setDataSelection((prev) => ({ ...prev, timeRange: range.id }))}
                          className={`px-3 py-2 rounded-lg border text-sm transition-all cursor-pointer ${
                            selected
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {range.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setClearModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className={`px-4 py-2 rounded-lg text-white font-semibold transition-colors disabled:opacity-50 ${
                    clearing ? 'bg-slate-400' : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {clearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Clear data
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── VPN / Proxy ────────────────────────────────────────────────────────────

function VpnSettings() {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">VPN / Proxy</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Save proxy settings and connect from the VPN page in the main navigation. Proxy routing applies only to browser webview traffic; it is not a device-wide VPN.
      </p>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

interface TabsProps {
  settings: BrowserSettingsType;
  onUpdate: (next: Partial<BrowserSettingsType>) => void;
}

function Tabs({ settings, onUpdate }: TabsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tabs</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure tab behavior and window management.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <LayoutGrid className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-slate-900 dark:text-white">Show full tab titles on hover</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Show the full page title when hovering over a tab.
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.tabPreview}
            onChange={(e) => onUpdate({ tabPreview: e.target.checked })}
            className="rounded-md text-brand-600 focus:ring-brand-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            When closing the last tab
          </label>
          <div className="space-y-2">
            {[
              { id: 'new-tab' as const, label: 'Open a new tab' },
              { id: 'close-window' as const, label: 'Close the browser window' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => onUpdate({ closeLastTabBehavior: opt.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                  settings.closeLastTabBehavior === opt.id
                    ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-200 dark:border-brand-900 text-brand-700 dark:text-brand-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {opt.id === 'new-tab' ? (
                  <PlusIcon className={`w-4 h-4 shrink-0 ${settings.closeLastTabBehavior === opt.id ? 'text-brand-600' : 'text-slate-400'}`} />
                ) : (
                  <X className={`w-4 h-4 shrink-0 ${settings.closeLastTabBehavior === opt.id ? 'text-brand-600' : 'text-slate-400'}`} />
                )}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── About ──────────────────────────────────────────────────────────────────

interface AboutProps {
  settings: BrowserSettingsType;
  onUpdate: (next: Partial<BrowserSettingsType>) => void;
}

function About({ settings, onUpdate }: AboutProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">About</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Version information and legal.
        </p>
      </div>

      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-brand-500/30">
          <Globe className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{APP_NAME}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Version {APP_VERSION}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Desktop browser with built-in VPN proxy support.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Electron</span>
            <span className="text-slate-900 dark:text-white font-mono text-xs">v45.3.1</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Chromium</span>
            <span className="text-slate-900 dark:text-white font-mono text-xs">Embedded</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">Node.js</span>
            <span className="text-slate-900 dark:text-white font-mono text-xs">Integrated</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          <a href="https://github.com/PrDevCore/GeoMindBrowser" target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 dark:hover:text-brand-400">
            GitHub
          </a>
          <a href="#" className="hover:text-brand-600 dark:hover:text-brand-400">Privacy</a>
          <a href="#" className="hover:text-brand-600 dark:hover:text-brand-400">Terms</a>
        </div>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main BrowserSettings component
// ---------------------------------------------------------------------------

interface BrowserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onClearData: (data: BrowsingData) => Promise<void>;
  settingsValue: BrowserSettingsType;
  onSettingsChange: (settings: BrowserSettingsType) => void;
}

export const BrowserSettings: React.FC<BrowserSettingsProps> = ({
  isOpen,
  onClose,
  onClearData,
  settingsValue,
  onSettingsChange,
}) => {
  const [settings, setSettings] = useState<BrowserSettingsType>(() => settingsValue);
  const [activeSection, setActiveSection] = useState<SettingSection>('general');

  const updateSettings = useCallback((next: Partial<BrowserSettingsType>) => {
    setSettings((prev) => ({ ...prev, ...next }));
  }, []);

  useEffect(() => {
    setSettings(settingsValue);
  }, [settingsValue]);

  // Persist settings on change
  useEffect(() => {
    writeSettings(settings);
    if (JSON.stringify(settings) !== JSON.stringify(settingsValue)) onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  if (!isOpen) return null;

  const sections: { id: SettingSection; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'privacy', label: 'Privacy', icon: <Shield className="w-4 h-4" /> },
    { id: 'vpn', label: 'VPN / Proxy', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'tabs', label: 'Tabs', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'about', label: 'About', icon: <Info className="w-4 h-4" /> },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <General settings={settings} onUpdate={updateSettings} />;
      case 'appearance':
        return <Appearance settings={settings} onUpdate={updateSettings} />;
      case 'privacy':
        return <Privacy settings={settings} onUpdate={updateSettings} onClearData={onClearData} />;
      case 'vpn':
        return <VpnSettings />;
      case 'tabs':
        return <Tabs settings={settings} onUpdate={updateSettings} />;
      case 'about':
        return <About settings={settings} onUpdate={updateSettings} />;
      default:
        return <General settings={settings} onUpdate={updateSettings} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm">
              <Settings2 className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Browser Settings</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0 overflow-y-auto">
            <div className="p-4 space-y-1">
              {sections.map((section) => (
                <SectionButton
                  key={section.id}
                  id={section.id}
                  label={section.label}
                  icon={section.icon}
                  active={activeSection === section.id}
                  onClick={() => setActiveSection(section.id)}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
};