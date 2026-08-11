import { generateKeyPairSync, createVerify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEbJwt } from '@/lib/enablebanking/jwt';
import { maskIban } from '@/lib/enablebanking/client';
import { comeArray, jsonRedatto } from '@/lib/enablebanking/redact';

/**
 * La chiave usata qui e' generata al volo dal test: non e' un segreto, non ha
 * niente a che vedere con quella reale, e non tocca mai il disco.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const APPLICATION_ID = '00000000-1111-2222-3333-444444444444';

function stubConfig(): void {
  vi.stubEnv('EB_APPLICATION_ID', APPLICATION_ID);
  vi.stubEnv('EB_PRIVATE_KEY_BASE64', Buffer.from(PRIVATE_PEM, 'utf8').toString('base64'));
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createEbJwt', () => {
  it('produce un header conforme alla specifica Enable Banking', () => {
    stubConfig();
    const [header] = createEbJwt().split('.');
    expect(decodeSegment(header!)).toEqual({
      typ: 'JWT',
      alg: 'RS256',
      kid: APPLICATION_ID,
    });
  });

  it('produce i claim richiesti, con exp dopo iat', () => {
    stubConfig();
    const now = new Date('2026-08-11T10:00:00Z');
    const [, payload] = createEbJwt(now).split('.');
    const claims = decodeSegment(payload!);

    expect(claims['iss']).toBe('enablebanking.com');
    expect(claims['aud']).toBe('api.enablebanking.com');
    expect(claims['iat']).toBe(Math.floor(now.getTime() / 1000));
    expect(Number(claims['exp'])).toBeGreaterThan(Number(claims['iat']));
    // Enable Banking rifiuta token con exp oltre 24 ore da iat.
    expect(Number(claims['exp']) - Number(claims['iat'])).toBeLessThanOrEqual(86400);
  });

  it('la firma e verificabile con la chiave pubblica corrispondente', () => {
    stubConfig();
    const token = createEbJwt();
    const [header, payload, signature] = token.split('.');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    verifier.end();

    expect(verifier.verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true);
  });

  it('rifiuta una chiave che non e base64 di un PEM', () => {
    vi.stubEnv('EB_APPLICATION_ID', APPLICATION_ID);
    vi.stubEnv('EB_PRIVATE_KEY_BASE64', Buffer.from('non sono una chiave').toString('base64'));
    expect(() => createEbJwt()).toThrow(/chiave PEM valida/);
  });

  it('rifiuta la configurazione incompleta invece di firmare con valori vuoti', () => {
    vi.stubEnv('EB_APPLICATION_ID', '');
    vi.stubEnv('EB_PRIVATE_KEY_BASE64', '');
    expect(() => createEbJwt()).toThrow(/EB_APPLICATION_ID/);
  });
});

describe('maskIban', () => {
  it('lascia visibili solo le ultime quattro cifre', () => {
    expect(maskIban('IT60X0542811101000000123456')).toBe('****3456');
  });

  it('ignora gli spazi di formattazione', () => {
    expect(maskIban('IT60 X054 2811 1010 0000 0123 456')).toBe('****3456');
  });

  it('non espone niente su input troppo corti', () => {
    expect(maskIban('IT60')).toBe('****');
  });
});

describe('redigi', () => {
  it('maschera un IBAN sotto una chiave che si chiama iban', () => {
    const dentro = { account_id: { iban: 'IT60X0542811101000000123456' } };
    expect(jsonRedatto(dentro)).toContain('****3456');
    expect(jsonRedatto(dentro)).not.toContain('0542811101');
  });

  it('maschera un IBAN annegato in una descrizione libera', () => {
    const dentro = { remittance_information: ['Bonifico a IT60X0542811101000000123456 causale X'] };
    expect(jsonRedatto(dentro)).not.toContain('0542811101');
  });

  it('non altera importi e date', () => {
    const dentro = { transaction_amount: { amount: '-12.34', currency: 'EUR' }, d: '2026-08-11' };
    expect(JSON.parse(jsonRedatto(dentro))).toEqual(dentro);
  });
});

describe('comeArray', () => {
  it('restituisce un array vuoto invece di far esplodere la pagina', () => {
    expect(comeArray(undefined)).toEqual([]);
    expect(comeArray(null)).toEqual([]);
    expect(comeArray({ balances: [] })).toEqual([]);
    expect(comeArray('testo')).toEqual([]);
  });

  it('lascia intatto un array vero', () => {
    expect(comeArray([1, 2])).toEqual([1, 2]);
  });
});
