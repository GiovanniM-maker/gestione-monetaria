import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedEmail, isPlausibleEmail, normalizeEmail } from '@/lib/auth/allowlist';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizeEmail', () => {
  it('applica trim e lowercase', () => {
    expect(normalizeEmail('  Mario.Rossi@Example.COM ')).toBe('mario.rossi@example.com');
  });

  it('non rimuove punti ne suffissi +tag', () => {
    // Sono regole specifiche di Gmail: applicarle allargherebbe l'allowlist.
    expect(normalizeEmail('m.rossi+spesa@example.com')).toBe('m.rossi+spesa@example.com');
  });
});

describe('isPlausibleEmail', () => {
  it('accetta un indirizzo normale', () => {
    expect(isPlausibleEmail('mario@example.com')).toBe(true);
  });

  it.each(['', 'mario', 'mario@', '@example.com', 'mario@example', 'ma rio@example.com'])(
    'rifiuta %j',
    (value) => {
      expect(isPlausibleEmail(value)).toBe(false);
    },
  );
});

describe('isAllowedEmail', () => {
  it('accetta l indirizzo configurato a prescindere da spazi e maiuscole', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'mario@example.com');
    expect(isAllowedEmail(' MARIO@Example.com ')).toBe(true);
  });

  it('rifiuta qualsiasi altro indirizzo', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'mario@example.com');
    expect(isAllowedEmail('luigi@example.com')).toBe(false);
  });

  it('rifiuta una variante con +tag: non e lo stesso indirizzo', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'mario@example.com');
    expect(isAllowedEmail('mario+altro@example.com')).toBe(false);
  });

  it('rifiuta null e undefined', () => {
    vi.stubEnv('ALLOWED_EMAIL', 'mario@example.com');
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
  });

  it('solleva se ALLOWED_EMAIL non e configurata, invece di lasciare passare', () => {
    vi.stubEnv('ALLOWED_EMAIL', '');
    expect(() => isAllowedEmail('mario@example.com')).toThrow(/ALLOWED_EMAIL/);
  });
});
