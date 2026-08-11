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
