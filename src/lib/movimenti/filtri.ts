/**
 * I filtri della lista movimenti, letti dall'indirizzo.
 *
 * Puro e testabile: qui non si tocca il database. Sta separato perche' e' la
 * parte che decide **cosa viene chiesto**, e un filtro letto male non da'
 * errore — restituisce una lista plausibile e sbagliata, che e' il tipo di
 * guasto che non si nota.
 *
 * Tutti i filtri vivono nell'indirizzo e nessuno in uno stato del browser. Cosi'
 * la pagina resta un componente server, il tasto indietro funziona, e una
 * ricerca si puo' mandare a se' stessi come collegamento — «i miei ristoranti
 * di marzo» e' un URL.
 */

export const TIPI = ['spesa', 'entrate', 'giroconti', 'tutti'] as const;
export type Tipo = (typeof TIPI)[number];

export const ORDINI = ['data', 'importo'] as const;
export type Ordine = (typeof ORDINI)[number];

export const CONTESTI = ['personale', 'business'] as const;

/**
 * La forma di uno slug di classe.
 *
 * Qui non si puo' controllare **quali** classi esistano: questo modulo e' puro
 * — e' cio' che permette di provarlo con dei test invece che con un database —
 * e le classi si creano mentre l'app e' accesa. Si controlla la forma, e uno
 * slug che non esiste semplicemente non trova righe: e' il comportamento
 * giusto, perche' il valore finisce in un argomento della RPC e non in una
 * stringa di query.
 *
 * Serve comunque un controllo: senza, qualunque testo dall'indirizzo
 * finirebbe stampato nella riga che descrive i filtri.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

/** Quante righe per pagina. Oltre, su un telefono, non si scorre piu'. */
export const PER_PAGINA = 50;

export type Filtri = {
  da: string | null;
  a: string | null;
  ricerca: string;
  categoria: string | null;
  merchant: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  tipo: Tipo;
  ordine: Ordine;
  pagina: number;
};

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function testo(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  const pulito = valore.trim();
  return pulito === '' ? null : pulito;
}

function unaDelle<T extends string>(valore: unknown, ammessi: readonly T[]): T | null {
  const v = testo(valore);
  return v !== null && (ammessi as readonly string[]).includes(v) ? (v as T) : null;
}

/**
 * Da parametri dell'indirizzo a filtri.
 *
 * Ogni valore non riconosciuto diventa `null` invece di essere passato al
 * database: un filtro inventato non deve poter arrivare fino a una query, e
 * non deve nemmeno far fallire la pagina — chi arriva da un collegamento
 * storto vede la lista senza quel filtro, non un errore.
 */
export function leggiFiltri(parametri: Record<string, string | string[] | undefined>): Filtri {
  const primo = (chiave: string): unknown => {
    const v = parametri[chiave];
    return Array.isArray(v) ? v[0] : v;
  };

  const giorno = (chiave: string): string | null => {
    const v = testo(primo(chiave));
    return v !== null && GIORNO.test(v) ? v : null;
  };

  const identificativo = (chiave: string): string | null => {
    const v = testo(primo(chiave));
    return v !== null && UUID.test(v) ? v : null;
  };

  const paginaGrezza = Number(testo(primo('pagina')) ?? '1');
  const pagina = Number.isInteger(paginaGrezza) && paginaGrezza > 0 ? paginaGrezza : 1;

  return {
    da: giorno('da'),
    a: giorno('a'),
    ricerca: testo(primo('q')) ?? '',
    categoria: identificativo('categoria'),
    merchant: identificativo('esercente'),
    discrezionalita: dellaFormaGiusta(primo('classe'), SLUG),
    contesto: unaDelle(primo('contesto'), CONTESTI),
    tipo: unaDelle(primo('tipo'), TIPI) ?? 'spesa',
    ordine: unaDelle(primo('ordine'), ORDINI) ?? 'data',
    pagina,
  };
}

/** Ricostruisce l'indirizzo, cambiando una cosa sola. */
export function indirizzo(filtri: Filtri, modifiche: Partial<Filtri> = {}): string {
  const f = { ...filtri, ...modifiche };
  const p = new URLSearchParams();

  if (f.da !== null) p.set('da', f.da);
  if (f.a !== null) p.set('a', f.a);
  if (f.ricerca !== '') p.set('q', f.ricerca);
  if (f.categoria !== null) p.set('categoria', f.categoria);
  if (f.merchant !== null) p.set('esercente', f.merchant);
  if (f.discrezionalita !== null) p.set('classe', f.discrezionalita);
  if (f.contesto !== null) p.set('contesto', f.contesto);
  if (f.tipo !== 'spesa') p.set('tipo', f.tipo);
  if (f.ordine !== 'data') p.set('ordine', f.ordine);
  // La pagina non entra quando e' la prima: cambiando un filtro si torna
  // sempre all'inizio, ed e' giusto — restare a pagina 7 di un elenco
  // diventato lungo tre righe mostrerebbe una lista vuota.
  if (f.pagina > 1 && modifiche.pagina !== undefined) p.set('pagina', String(f.pagina));

  const stringa = p.toString();
  return stringa === '' ? '/movimenti' : `/movimenti?${stringa}`;
}

/** Il primo e l'ultimo giorno di un mese `YYYY-MM`, per arrivare qui dal cruscotto. */
/**
 * I filtri attivi, detti a parole. Serve al riassunto sopra la lista.
 *
 * Sette controlli aperti occupavano tutta la prima schermata, e la lista — che
 * e' il motivo per cui si apre questa pagina — cominciava sotto il bordo. Ora
 * i controlli stanno chiusi e al loro posto c'e' **cio' che stanno facendo**:
 * un elenco che si legge in un secondo, e che dice se vale la pena aprirli.
 *
 * `tipo` c'e' sempre, anche quando e' quello predefinito: e' il filtro che piu'
 * di ogni altro spiega perche' il totale e' quello — «spese reali» significa
 * senza giroconti — e sottinteso sarebbe la prima cosa che si dimentica.
 *
 * I nomi di categoria ed esercente non li sa questa funzione: chi chiama passa
 * quelli che ha risolto, o niente e restano «una categoria». Risolverli qui
 * vorrebbe dire una query dentro una funzione pura.
 */
export function descriviFiltri(
  filtri: Filtri,
  nomi: { categoria?: string | null; esercente?: string | null; classe?: string | null } = {},
): readonly string[] {
  const voci: string[] = [];
  const etichette: Record<Tipo, string> = {
    spesa: 'spese reali',
    entrate: 'entrate',
    giroconti: 'giroconti',
    tutti: 'tutti i movimenti',
  };
  voci.push(etichette[filtri.tipo]);

  if (filtri.da !== null && filtri.a !== null) voci.push(`${filtri.da} → ${filtri.a}`);
  else if (filtri.da !== null) voci.push(`dal ${filtri.da}`);
  else if (filtri.a !== null) voci.push(`fino al ${filtri.a}`);

  if (filtri.categoria !== null) voci.push(nomi.categoria ?? 'una categoria');
  if (filtri.merchant !== null) voci.push(nomi.esercente ?? 'un esercente');
  if (filtri.discrezionalita !== null) voci.push(nomi.classe ?? filtri.discrezionalita);
  if (filtri.contesto !== null) voci.push(filtri.contesto);
  if (filtri.ricerca !== '') voci.push(`«${filtri.ricerca}»`);
  if (filtri.ordine === 'importo') voci.push('dal più grosso');

  return voci;
}

function dellaFormaGiusta(valore: unknown, forma: RegExp): string | null {
  return typeof valore === 'string' && forma.test(valore) ? valore : null;
}

/** Se qualcosa restringe la lista. Il solo `tipo` non conta: c'e' sempre. */
export function filtriAttivi(filtri: Filtri): boolean {
  return (
    filtri.da !== null ||
    filtri.a !== null ||
    filtri.categoria !== null ||
    filtri.merchant !== null ||
    filtri.discrezionalita !== null ||
    filtri.contesto !== null ||
    filtri.ricerca !== ''
  );
}

export function estremiDelMese(mese: string): { da: string; a: string } | null {
  const trovato = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mese.trim());
  if (trovato === null) return null;

  const anno = Number(trovato[1]);
  const numero = Number(trovato[2]);
  // Il giorno zero del mese successivo e' l'ultimo del mese: si evita di
  // ricordare quali mesi hanno trenta giorni e quando febbraio ne ha ventinove.
  // `Date.UTC` e non `new Date(...)`: qui non deve entrare nessun fuso.
  const ultimo = new Date(Date.UTC(anno, numero, 0)).getUTCDate();

  return {
    da: `${mese}-01`,
    a: `${mese}-${String(ultimo).padStart(2, '0')}`,
  };
}
