import { useEffect, useState } from 'react';
import { TabType } from './types';
import { applyAccentPalette, readStoredTheme, writeStoredTheme } from './data/themes';
import { VPN_LOCATIONS } from './data/vpn';
import { useVpnProxy } from './lib/vpn';
import { Navbar } from './components/Navbar';
import { BrowserView } from './components/BrowserView';
import { WorkflowBoard } from './components/WorkflowBoard';
import { CollaborativeDocs } from './components/CollaborativeDocs';
import { TeamHub } from './components/TeamHub';
import { VpnHub } from './components/VpnHub';
import { ThemeCustomizer } from './components/ThemeCustomizer';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';

function AppShell() {
  const storedTheme = readStoredTheme();
  const [activeTab, setActiveTab] = useState<TabType>('browser');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [accentColor, setAccentColor] = useState<string>(storedTheme.accentColor);
  const [bgTheme, setBgTheme] = useState<string>(storedTheme.bgTheme);
  const [themeModalOpen, setThemeModalOpen] = useState<boolean>(false);

  // Real VPN proxy state
  const { vpnState, proxyConfigs, proxyConfigError, saveProxyConfig, removeProxyConfig, connect, disconnect } = useVpnProxy();
  const vpnEnabled = vpnState.status === 'connected';
  const activeVpnLocation = vpnState.activeLocation;

  useEffect(() => { applyAccentPalette(accentColor); }, [accentColor]);
  useEffect(() => { writeStoredTheme({ accentColor, bgTheme }); }, [accentColor, bgTheme]);

  useEffect(() => {
    if (bgTheme === 'arctic' || bgTheme === 'white') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, [bgTheme]);

  const getBgClass = () => {
    switch (bgTheme) {
      case 'arctic': return 'bg-slate-50 text-slate-900';
      case 'white': return 'bg-white text-slate-900';
      case 'obsidian': return 'bg-black text-slate-100';
      default: return 'bg-slate-950 text-slate-100';
    }
  };

  return (
    <div className={`min-h-screen ${getBgClass()} font-sans transition-colors`}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={(dark) => {
          setIsDarkMode(dark);
          setBgTheme(dark ? 'obsidian' : 'arctic');
        }}
        vpnState={vpnState}
        onOpenThemeModal={() => setThemeModalOpen(true)}
      />

      <main>
        {activeTab === 'browser' && (
          <BrowserView
            vpnEnabled={vpnEnabled}
            setVpnEnabled={(enabled) => { if (!enabled) disconnect(); }}
            vpnLocations={VPN_LOCATIONS}
            activeVpnLocation={activeVpnLocation}
            setActiveVpnLocation={(loc) => connect(loc)}
          />
        )}
        {activeTab === 'workflow' && <WorkflowBoard />}
        {activeTab === 'docs' && <CollaborativeDocs />}
        {activeTab === 'team' && <TeamHub activeVpnLocation={activeVpnLocation} />}
        {activeTab === 'vpn' && (
          <VpnHub
            vpnState={vpnState}
            vpnLocations={VPN_LOCATIONS}
            proxyConfigs={proxyConfigs}
            proxyConfigError={proxyConfigError}
            onConnect={connect}
            onDisconnect={disconnect}
            onSaveProxyConfig={saveProxyConfig}
            onRemoveProxyConfig={removeProxyConfig}
          />
        )}
      </main>

      <ThemeCustomizer
        isOpen={themeModalOpen}
        onClose={() => setThemeModalOpen(false)}
        accentColor={accentColor}
        setAccentColor={setAccentColor}
        bgTheme={bgTheme}
        setBgTheme={setBgTheme}
      />
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Signing in…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <>
      <AppShell />
      <div className="fixed bottom-4 right-4 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <span>Signed in as {user.name}</span>
        <button onClick={logout} className="underline hover:text-slate-200 dark:hover:text-slate-300">
          Sign out
        </button>
      </div>
    </>
  );
}
