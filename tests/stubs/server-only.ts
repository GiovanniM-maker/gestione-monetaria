/**
 * Stub di `server-only` per Vitest.
 *
 * Il pacchetto reale espone due varianti: un modulo vuoto sotto la condizione
 * `react-server`, e uno che lancia in tutti gli altri casi. Next risolve la
 * prima, Vitest la seconda, e i moduli server-only diventerebbero non
 * testabili. Questo stub riproduce la variante vuota.
 *
 * Non indebolisce la garanzia: `server-only` protegge dal finire in un bundle
 * client, e i bundle li costruisce Next, non Vitest.
 */
export {};
