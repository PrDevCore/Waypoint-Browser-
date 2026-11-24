import type { VpnLocation } from '../types';

/** Illustrative gateway list. Nothing here opens a tunnel or routes traffic. */
export const VPN_LOCATIONS: VpnLocation[] = [
  { id: 'lon', country: 'United Kingdom', city: 'London', flag: '🇬🇧', ip: '192.0.2.10', ping: 18, load: '12%' },
  { id: 'nyc', country: 'United States', city: 'New York', flag: '🇺🇸', ip: '192.0.2.24', ping: 42, load: '28%' },
  { id: 'fra', country: 'Germany', city: 'Frankfurt', flag: '🇩🇪', ip: '198.51.100.15', ping: 24, load: '19%' },
  { id: 'tyo', country: 'Japan', city: 'Tokyo', flag: '🇯🇵', ip: '203.0.113.30', ping: 110, load: '35%' },
];
