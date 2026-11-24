import { useCallback, useEffect, useRef, useState } from "react";
import type { VpnLocation, VpnState } from "../types";
import { VPN_LOCATIONS } from "../data/vpn";

// Proxy config stored per location id
export interface ProxyConfig {
  proxyType: "socks5" | "http";
  proxyHost: string;
  proxyPort: number;
  proxyUsername?: string;
  proxyPassword?: string;
}

// Namespaced localStorage key per VPN location
let legacyCredentialsRemoved = false;

function getConfigKey(locationId: string): string {
  return `waypoint.vpn.config.${locationId}`;
}

export type ProxyConfigMap = Record<string, ProxyConfig>;

// Read proxy config for a specific location from namespaced localStorage
export function readLocationConfig(locationId: string): ProxyConfig {
  const fallback: ProxyConfig = { proxyType: "socks5", proxyHost: "", proxyPort: 1080 };
  const raw = localStorage.getItem(getConfigKey(locationId));
  if (!raw) return fallback;

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Stored proxy configuration is invalid.");
  }

  const stored = parsed as Record<string, unknown>;
  const { proxyUsername, proxyPassword, ...nonSecretConfig } = stored;
  if (proxyUsername !== undefined || proxyPassword !== undefined) {
    localStorage.setItem(getConfigKey(locationId), JSON.stringify(nonSecretConfig));
    legacyCredentialsRemoved = true;
  }

  const proxyType = nonSecretConfig.proxyType ?? fallback.proxyType;
  const proxyHost = nonSecretConfig.proxyHost ?? fallback.proxyHost;
  const proxyPort = nonSecretConfig.proxyPort ?? fallback.proxyPort;
  if ((proxyType !== "socks5" && proxyType !== "http")
    || typeof proxyHost !== "string"
    || typeof proxyPort !== "number"
    || !Number.isInteger(proxyPort)
    || proxyPort < 1
    || proxyPort > 65535) {
    throw new Error("Stored proxy configuration is invalid.");
  }
  return { proxyType, proxyHost, proxyPort };
}

// Save proxy config for a specific location to namespaced localStorage
export function saveLocationConfig(locationId: string, config: ProxyConfig): void {
  const { proxyUsername: _username, proxyPassword: _password, ...nonSecretConfig } = config;
  localStorage.setItem(getConfigKey(locationId), JSON.stringify(nonSecretConfig));
}

// Whether the app is running inside Electron (IPC available)
export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

function loadLocalProxyConfigs(): { configs: ProxyConfigMap; error: string | null } {
  const configs: ProxyConfigMap = {};
  for (const location of VPN_LOCATIONS) {
    try {
      configs[location.id] = readLocationConfig(location.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { configs, error: `Unable to load proxy settings for ${location.city}: ${message}` };
    }
  }
  return { configs, error: null };
}

export function useVpnProxy() {
  const [vpnState, setVpnState] = useState<VpnState>({ status: "off", activeLocation: null });
  const [initialLocalConfig] = useState(loadLocalProxyConfigs);
  const [proxyConfigs, setProxyConfigs] = useState<ProxyConfigMap>(initialLocalConfig.configs);
  const [proxyConfigError, setProxyConfigError] = useState<string | null>(() =>
    initialLocalConfig.error ?? (legacyCredentialsRemoved
      ? "Old proxy credentials were removed from browser storage. Re-enter them in the desktop app to save them securely."
      : null)
  );

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.loadProxyConfigs()
      .then(saved => setProxyConfigs(current => ({ ...current, ...saved })))
      .catch(error => setProxyConfigError(error instanceof Error ? error.message : String(error)));
  }, []);

  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending timers if the component unmounts
  useEffect(() => {
    return () => {
      if (testTimer.current) clearTimeout(testTimer.current);
    };
  }, []);

  const saveProxyConfig = useCallback(async (locationId: string, config: ProxyConfig): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.saveProxyConfig(locationId, config);
    else saveLocationConfig(locationId, config);
    setProxyConfigs(prev => ({ ...prev, [locationId]: config }));
    setProxyConfigError(null);
  }, []);

  const removeProxyConfig = useCallback(async (locationId: string): Promise<void> => {
    if (window.electronAPI) await window.electronAPI.removeProxyConfig(locationId);
    try {
      localStorage.removeItem(getConfigKey(locationId));
    } catch (error) {
      setProxyConfigError(error instanceof Error ? error.message : String(error));
      throw error;
    }
    setProxyConfigs(prev => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
    setProxyConfigError(null);
  }, []);

  const connect = useCallback(
    async (location: VpnLocation): Promise<void> => {
      const config = proxyConfigs[location.id];

      // --- Strict pre-flight validation ---
      if (!isElectron()) {
        setVpnState({
          status: "error",
          activeLocation: location,
          errorMessage: "VPN requires Electron desktop environment",
        });
        return;
      }

      if (!config?.proxyHost) {
        setVpnState({
          status: "error",
          activeLocation: location,
          errorMessage: "Proxy host configuration missing for this location",
        });
        return;
      }
      // ------------------------------------

      if (testTimer.current) clearTimeout(testTimer.current);
      setVpnState({ status: "connecting", activeLocation: location });

      try {
        const result = await window.electronAPI!.vpnConnect({
          proxyType: config.proxyType ?? "socks5",
          proxyHost: config.proxyHost,
          proxyPort: config.proxyPort,
          proxyUsername: config.proxyUsername,
          proxyPassword: config.proxyPassword,
        });

        if (!result.ok) {
          setVpnState({
            status: "error",
            activeLocation: location,
            errorMessage: result.error ?? "Failed to set proxy",
          });
          return;
        }

        // --- IMMEDIATE PROXY CONNECTIVITY TEST ---
        let immediateTestOk = false;
        try {
          const immediateTest = await window.electronAPI!.vpnTest(
            "https://www.cloudflare.com/cdn-cgi/trace"
          );
          immediateTestOk = immediateTest.ok;
        } catch {
          immediateTestOk = false;
        }

        if (!immediateTestOk) {
          setVpnState({
            status: "error",
            activeLocation: location,
            errorMessage: "Proxy connectivity test failed immediately",
          });
          return;
        }
        // -----------------------------------------

        // Schedule delayed secondary reachability verification
        testTimer.current = setTimeout(async () => {
          try {
            const test = await window.electronAPI!.vpnTest("https://www.example.com");
            if (test.ok) {
              setVpnState({ status: "connected", activeLocation: location });
            } else {
              setVpnState({
                status: "error",
                activeLocation: location,
                errorMessage: `Proxy unreachable (${test.error ?? `HTTP ${test.status}`})`,
              });
            }
          } catch {
            setVpnState({
              status: "error",
              activeLocation: location,
              errorMessage: "Proxy test failed",
            });
          }
        }, 500);
      } catch (err) {
        setVpnState({
          status: "error",
          activeLocation: location,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [proxyConfigs]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (testTimer.current) clearTimeout(testTimer.current);
    if (isElectron()) {
      await window.electronAPI!.vpnDisconnect().catch(() => {});
    }
    setVpnState({ status: "off", activeLocation: null });
  }, []);

  return {
    vpnState,
    proxyConfigs,
    proxyConfigError,
    saveProxyConfig,
    removeProxyConfig,
    connect,
    disconnect,
  };
}
