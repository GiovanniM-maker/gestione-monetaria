/**
 * Dove riportare l'utente dopo l'accesso.
 *
 * ---------------------------------------------------------------------------
 * Perche' non basta usare quello che arriva
 * ---------------------------------------------------------------------------
 * Il percorso arriva da un parametro dell'indirizzo, cioe' da qualcosa che
 * chiunque puo' scrivere. Passato a `redirect()` senza controllarlo, un
 * indirizzo come `//esempio.invalido` diventa una **redirezione aperta**: si
 * accede al nostro dominio e ci si ritrova su un altro, dopo aver visto la
 * nostra schermata di accesso. E' il modo classico di rendere credibile una
 * pagina che raccoglie credenziali.
 *
 * Quindi si accetta solo un percorso **interno**, e nel dubbio si torna a casa:
 * arrivare al cruscotto invece che alla schermata da cui si veniva e' una
 * seccatura, l'altra cosa e' un problema di sicurezza.
 */

/** Dove si va quando non si sa dove andare. */
export const CASA = '/';

export function ritornoSicuro(grezzo: unknown): string {
  if (typeof grezzo !== 'string') return CASA;

  const percorso = grezzo.trim();
  if (percorso === '') return CASA;

  // Deve cominciare con una barra sola: `//host` e `https://host` sono
  // entrambi indirizzi assoluti verso un altro dominio.
  if (!percorso.startsWith('/') || percorso.startsWith('//')) return CASA;

  // Alcuni browser normalizzano `/\host` in `//host`: vale come il caso sopra.
  if (percorso.startsWith('/\\')) return CASA;

  // Un ritorno alla pagina di accesso sarebbe un anello: si e' appena entrati.
  if (percorso === '/login' || percorso.startsWith('/login?')) return CASA;

  // Caratteri di controllo: possono spezzare l'intestazione `Location` e farne
  // nascere una seconda.
  if (/[\u0000-\u001f\u007f]/.test(percorso)) return CASA;

  return percorso;
}
