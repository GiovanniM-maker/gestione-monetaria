import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicEnv } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('publicEnv.siteUrl', () => {
  it('lascia intatta un origine gia corretta', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://esempio.vercel.app');
    expect(publicEnv.siteUrl).toBe('https://esempio.vercel.app');
  });

  it('rimuove lo slash finale', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://esempio.vercel.app/');
    expect(publicEnv.siteUrl).toBe('https://esempio.vercel.app');
  });

  it('scarta il percorso: incollare l URL di callback non deve raddoppiarlo', () => {
    // Il caso reale: `${siteUrl}/auth/callback` diventerebbe
    // `/auth/callback/auth/callback`, che risponde 404.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://esempio.vercel.app/auth/callback');
    expect(publicEnv.siteUrl).toBe('https://esempio.vercel.app');
  });

  it('conserva la porta in sviluppo locale', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(publicEnv.siteUrl).toBe('http://localhost:3000');
  });

  it('rifiuta un valore senza schema', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'esempio.vercel.app');
    expect(() => publicEnv.siteUrl).toThrow(/URL assoluto valido/);
  });

  it('rifiuta un valore assente', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(() => publicEnv.siteUrl).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
