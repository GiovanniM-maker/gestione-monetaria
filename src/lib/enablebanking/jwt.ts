import 'server-only';
import { createSign } from 'node:crypto';
import { ebConfig } from './config';

/**
 * Firma dei JWT per Enable Banking.
 *
 * Scritta con `node:crypto` invece che con una libreria: sono poche righe, il
 * formato e' fissato dalla specifica di Enable Banking e non cambia, e
 * `CLAUDE.md` chiede di non aggiungere dipendenze non necessarie.
 *
 * Formato richiesto:
 *   header  { "typ": "JWT", "alg": "RS256", "kid": <application id> }
 *   claims  { "iss": "enablebanking.com", "aud": "api.enablebanking.com",
 *             "iat": <ora>, "exp": <ora + durata> }
 *
 * `exp` puo' stare fino a 24 ore dopo `iat`. Ne usiamo molte meno: il token si
 * rigenera a ogni chiamata, quindi una vita lunga non darebbe alcun vantaggio e
 * allungherebbe soltanto la finestra utile a chi lo intercettasse.
 */

const TOKEN_TTL_SECONDS = 300;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function createEbJwt(now: Date = new Date()): string {
  const { applicationId, privateKeyPem } = ebConfig();

  const issuedAt = Math.floor(now.getTime() / 1000);

  const header = { typ: 'JWT', alg: 'RS256', kid: applicationId };
  const claims = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${base64url(signer.sign(privateKeyPem))}`;
}
