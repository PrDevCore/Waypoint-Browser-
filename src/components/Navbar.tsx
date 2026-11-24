import React from 'react';
import { TabType } from '../types';
import type { VpnState } from '../types';
import {
  Globe, Kanban, FileText, Users,
  ShieldCheck, ShieldAlert, ShieldOff,
  Sun, Moon, Palette, Loader2,
} from 'lucide-react';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  vpnState: VpnState;
  onOpenThemeModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
  vpnState,
  onOpenThemeModal,
}) => {
  const { status, activeLocation } = vpnState;

  const vpnLabel =
    status === 'connected'   ? (activeLocation?.city ?? 'Connected') :
    status === 'connecting'  ? 'Connecting…' :
    status === 'error'       ? 'Error' :
                               'off';

  const VpnIcon =
    status === 'connected'  ? ShieldCheck :
    status === 'connecting' ? Loader2 :
    status === 'error'      ? ShieldAlert :
                              ShieldOff;

  const vpnColor =
    status === 'connected'  ? 'text-emerald-500' :
    status === 'error'      ? 'text-red-400' :
                              'text-slate-400';

  const vpnTabColor =
    status === 'connected'  ? 'text-emerald-500' :
    status === 'error'      ? 'text-red-400' :
                              'text-slate-400';

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors">

      {/* Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-md shadow-brand-500/25">
          <Globe className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            Waypoint
          </h1>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
            <VpnIcon className={`w-3 h-3 ${vpnColor} ${status === 'connecting' ? 'animate-spin' : ''}`} />
            <span>VPN: {vpnLabel}</span>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
        {([
          { id: 'browser',  label: 'Browser',    icon: <Globe    className="w-3.5 h-3.5 text-blue-500" /> },
          { id: 'workflow', label: 'Workflows',   icon: <Kanban   className="w-3.5 h-3.5 text-brand-500" /> },
          { id: 'docs',     label: 'Docs',        icon: <FileText className="w-3.5 h-3.5 text-amber-500" /> },
          { id: 'team',     label: 'Team Hub',    icon: <Users    className="w-3.5 h-3.5 text-emerald-500" /> },
          { id: 'vpn',      label: 'VPN',         icon: <VpnIcon  className={`w-3.5 h-3.5 ${vpnTabColor} ${status === 'connecting' ? 'animate-spin' : ''}`} /> },
        ] as { id: TabType; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
              activeTab === id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenThemeModal}
          aria-label="Customize theme"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Palette className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          aria-label="Toggle dark mode"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
