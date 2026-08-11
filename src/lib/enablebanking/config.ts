import 'server-only';

/**
 * Configurazione Enable Banking. Modulo server-only: la chiave privata non
 * deve poter finire in nessun bundle client, nemmeno per errore di import.
 */

export type EbConfig = {
  /** Application ID del Control Panel. Diventa il `kid` dell'header JWT. */
  readonly applicationId: string;
  /** Chiave privata in formato PEM, decodificata da base64. */
  readonly privateKeyPem: string;
};

const PEM_HEADER = /-----BEGIN [A-Z ]*KEY-----/;

export function ebConfig(): EbConfig {
  const applicationId = process.env.EB_APPLICATION_ID?.trim();
  if (applicationId === undefined || applicationId === '') {
    throw new Error("Variabile d'ambiente mancante: EB_APPLICATION_ID.");
  }

  const encoded = process.env.EB_PRIVATE_KEY_BASE64?.trim();
  if (encoded === undefined || encoded === '') {
    throw new Error("Variabile d'ambiente mancante: EB_PRIVATE_KEY_BASE64.");
  }

  const privateKeyPem = Buffer.from(encoded, 'base64').toString('utf8');

  // Una chiave incollata senza passare da base64, o troncata, produrrebbe
  // altrimenti un errore di firma incomprensibile a valle.
  if (!PEM_HEADER.test(privateKeyPem)) {
    throw new Error(
      'EB_PRIVATE_KEY_BASE64 non contiene una chiave PEM valida una volta decodificata. ' +
        'Va impostata con il contenuto del file .pem codificato in base64, su una sola riga.',
    );
  }

  return { applicationId, privateKeyPem };
}

export const EB_BASE_URL = 'https://api.enablebanking.com';

export type EbConfigStatus = {
  applicationId: 'ok' | 'mancante';
  privateKey: 'ok' | 'mancante' | 'non decodificabile';
  /** Lunghezza della chiave PEM decodificata. Utile a smascherare un valore troncato. */
  privateKeyLength: number;
};

/**
 * Diagnostica della configurazione, senza mai esporne i valori.
 *
 * Serve a distinguere a colpo d'occhio "variabile non impostata" da "chiave
 * incollata male" da "tutto a posto ma l'API rifiuta": tre problemi diversi che
 * senza questo pannello si presentano tutti come un errore HTTP opaco.
 */
export function ebConfigStatus(): EbConfigStatus {
  const applicationId = process.env.EB_APPLICATION_ID?.trim();
  const encoded = process.env.EB_PRIVATE_KEY_BASE64?.trim();

  if (encoded === undefined || encoded === '') {
    return {
      applicationId: applicationId !== undefined && applicationId !== '' ? 'ok' : 'mancante',
      privateKey: 'mancante',
      privateKeyLength: 0,
    };
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');

  return {
    applicationId: applicationId !== undefined && applicationId !== '' ? 'ok' : 'mancante',
    privateKey: PEM_HEADER.test(decoded) ? 'ok' : 'non decodificabile',
    privateKeyLength: decoded.length,
  };
}
