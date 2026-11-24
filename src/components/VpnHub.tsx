import React, { useState } from 'react';
import {
  ShieldAlert, ShieldCheck, ShieldOff, Loader2, Settings2,
  Eye, EyeOff, Trash2, Info, Wifi, WifiOff, CheckCircle2, XCircle,
} from 'lucide-react';
import type { VpnLocation, VpnState } from '../types';
import type { ProxyConfig, ProxyConfigMap } from '../lib/vpn';
import { isElectron } from '../lib/vpn';

interface VpnHubProps {
  vpnState: VpnState;
  vpnLocations: VpnLocation[];
  proxyConfigs: ProxyConfigMap;
  proxyConfigError?: string | null;
  onConnect: (location: VpnLocation) => void;
  onDisconnect: () => void;
  onSaveProxyConfig: (locationId: string, config: ProxyConfig) => Promise<void>;
  onRemoveProxyConfig: (locationId: string) => Promise<void>;
}

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, city }: { status: VpnState['status']; city?: string }) {
  switch (status) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Connected{city ? ` · ${city}` : ''}
        </span>
      );
    case 'connecting':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold">
          <XCircle className="w-3.5 h-3.5" /> Error
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
          <ShieldOff className="w-3.5 h-3.5" /> Disconnected
        </span>
      );
  }
}

// ── Proxy config form ────────────────────────────────────────────────────────
interface ProxyFormProps {
  locationId: string;
  initial?: ProxyConfig;
  onSave: (cfg: ProxyConfig) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

function ProxyForm({ locationId: _, initial, onSave, onRemove, onClose }: ProxyFormProps) {
  const [type, setType] = useState<'socks5' | 'http'>(initial?.proxyType ?? 'socks5');
  const [host, setHost] = useState(initial?.proxyHost ?? '');
  const [port, setPort] = useState(String(initial?.proxyPort ?? '1080'));
  const [user, setUser] = useState(initial?.proxyUsername ?? '');
  const [pass, setPass] = useState(initial?.proxyPassword ?? '');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    if (!host.trim()) { setErr('Proxy host is required'); return; }
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) { setErr('Port must be an integer from 1 to 65535'); return; }
    setErr('');
    try {
      await onSave({ proxyType: type, proxyHost: host.trim(), proxyPort: p, proxyUsername: user || undefined, proxyPassword: pass || undefined });
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRemove = async () => {
    setErr('');
    try {
      await onRemove();
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Proxy configuration</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'socks5' | 'http')}
            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP / HTTPS</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Port</label>
          <input
            type="number"
            value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="1080"
            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Proxy host / IP</label>
        <input
          type="text"
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder="e.g. 192.168.1.1 or proxy.example.com"
          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Username <span className="text-slate-400">(optional)</span></label>
          <input
            type="text"
            value={user}
            onChange={e => setUser(e.target.value)}
            autoComplete="off"
            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Password <span className="text-slate-400">(optional)</span></label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="new-password"
              className="w-full px-2 py-1.5 pr-7 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => setShowPass(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleRemove}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function VpnHub({
  vpnState,
  vpnLocations,
  proxyConfigs,
  proxyConfigError,
  onConnect,
  onDisconnect,
  onSaveProxyConfig,
  onRemoveProxyConfig,
}: VpnHubProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const electron = isElectron();
  const { status, activeLocation, errorMessage } = vpnState;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 text-slate-900 dark:text-slate-100">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">VPN Proxy</h2>
          <div className="mt-2">
            <StatusBadge status={status} city={activeLocation?.city} />
          </div>
          {status === 'error' && errorMessage && (
            <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>
          )}
          {proxyConfigError && <p role="alert" className="mt-1.5 text-xs text-red-500">{proxyConfigError}</p>}
          {status === 'connected' && activeLocation && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
              Browser traffic routed via {proxyConfigs[activeLocation.id]?.proxyType?.toUpperCase() ?? 'proxy'} ·{' '}
              {proxyConfigs[activeLocation.id]?.proxyHost}:{proxyConfigs[activeLocation.id]?.proxyPort}
            </p>
          )}
        </div>

        {status === 'connected' || status === 'connecting' ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <WifiOff className="w-4 h-4" /> Disconnect
          </button>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            {electron
              ? 'Select a gateway below and configure its proxy to connect.'
              : 'Running in browser mode — proxy routing requires the Electron desktop app.'}
          </div>
        )}
      </div>

      {/* How it works */}
      {!electron && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex gap-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Desktop app required.</span> Proxy routing is only available in the Electron desktop build. In browser mode the VPN selection is cosmetic.
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3 flex gap-3 text-xs text-slate-600 dark:text-slate-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">How it works:</span>{' '}
          Waypoint routes all browser (<code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">webview</code>) traffic through the SOCKS5 or HTTP proxy you configure here. Your app shell and API calls are unaffected. You need to supply your own proxy server — this works with any SOCKS5/HTTP proxy provider, SSH tunnels (<code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded">ssh -D 1080</code>), or self-hosted solutions like Shadowsocks, Dante, or Squid.
        </div>
      </div>

      {/* Gateway list */}
      <div className="space-y-3">
        {vpnLocations.map(loc => {
          const cfg = proxyConfigs[loc.id];
          const isActive = activeLocation?.id === loc.id;
          const isConnected = isActive && status === 'connected';
          const isConnecting = isActive && status === 'connecting';
          const isEditing = editingId === loc.id;

          return (
            <div
              key={loc.id}
              className={`rounded-2xl border p-4 transition-all ${
                isConnected
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                  : isConnecting
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{loc.flag}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{loc.city}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{loc.country}</span>
                    {cfg ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 text-[10px] font-mono font-semibold">
                        <Wifi className="w-2.5 h-2.5" />
                        {cfg.proxyType.toUpperCase()} · {cfg.proxyHost}:{cfg.proxyPort}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">No proxy configured</span>
                    )}
                  </div>
                  {isConnected && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      ● Active — browser traffic is being routed
                    </p>
                  )}
                  {isConnecting && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Testing proxy connection…
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : loc.id)}
                    title="Configure proxy"
                    className={`p-1.5 rounded-lg transition-colors ${isEditing ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700'}`}
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>

                  {isConnected ? (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                    >
                      <ShieldOff className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isConnecting}
                      onClick={() => onConnect(loc)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        cfg
                          ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                      } disabled:opacity-50`}
                    >
                      {isConnecting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting</>
                        : <><ShieldCheck className="w-3.5 h-3.5" /> {cfg ? 'Connect' : 'Connect anyway'}</>}
                    </button>
                  )}
                </div>
              </div>

              {/* Proxy config form inline */}
              {isEditing && (
                <ProxyForm
                  locationId={loc.id}
                  initial={cfg}
                  onSave={cfg => onSaveProxyConfig(loc.id, cfg)}
                  onRemove={() => onRemoveProxyConfig(loc.id)}
                  onClose={() => setEditingId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* SSH tunnel hint */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 text-xs text-slate-600 dark:text-slate-400">
        <p className="font-semibold text-slate-700 dark:text-slate-300">Quick start: SSH SOCKS5 tunnel</p>
        <p>If you have SSH access to a remote server, you can create a local SOCKS5 proxy in one command:</p>
        <pre className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-800 dark:text-slate-200 overflow-x-auto">
          ssh -N -D 1080 user@your-server.example.com
        </pre>
        <p>Then configure any gateway above with <strong>SOCKS5</strong>, host <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">127.0.0.1</code>, port <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">1080</code>.</p>
      </div>
    </div>
  );
}
