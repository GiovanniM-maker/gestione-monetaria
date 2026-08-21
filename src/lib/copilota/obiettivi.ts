import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';

/**
 * Gli obiettivi: cosa l'utente **vuole**, non cosa **e' vero**.
 *
 * ---------------------------------------------------------------------------
 * Perche' non e' una memoria
 * ---------------------------------------------------------------------------
 * E' l'unica delle cinque nature dell'informazione che abbia bisogno di una
 * tabella nuova. Lo Stato sta gia' nello schema, le Misure si ricalcolano, la
 * Conversazione scade, e le Letture non sopravvivono al messaggio.
 *
 * La regola che tiene: **tutto cio' che il copilota sa, deve poterlo sapere
 * anche il resto dell'applicazione.** Un obiettivo e' una riga leggibile da
 * chiunque, con un tipo e una forma — non una frase in un sacco che solo il
 * copilota apre.
 *
 * ---------------------------------------------------------------------------
 * La scadenza non e' burocrazia
 * ---------------------------------------------------------------------------
 * Lo Stato si autocorregge: un `episodico` sbagliato si vede subito, perche'
 * sposta un numero che si guarda. Un obiettivo no. «Meno di 300 € al mese nei
 * ristoranti», messo a gennaio e dimenticato, ad agosto e' ancora li' — e il
 * copilota continua a ottimizzare per una cosa che non si vuole piu'.
 *
 * Scaduto non vuol dire cancellato: la riga resta, `stato` diventa `scaduto`, e
 * il copilota la vede e puo' chiedere se vale ancora. **Un obiettivo
 * sopravvive perche' lo si conferma.**
 */

export const TIPI_OBIETTIVO = [
  'tetto_di_spesa',
  'liquidita_minima',
  'ridurre',
  'risparmiare',
] as const;

export type TipoObiettivo = (typeof TIPI_OBIETTIVO)[number];

export type RigaObiettivo = {
  id: string;
  tipo: TipoObiettivo;
  categoria_id: string | null;
  categoria: string | null;
  classe: string | null;
  classe_nome: string | null;
  valore: string | null;
  nota: string | null;
  created_at: string;
  valido_fino_a: string;
  stato: 'attivo' | 'scaduto';
  giorni_alla_scadenza: number;
};

export class ObiettivoNonValido extends Error {}

/** Tutti, scaduti compresi: uno scaduto va mostrato per poterlo rinnovare. */
export async function leggiObiettivi(): Promise<readonly RigaObiettivo[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('v_obiettivi')
    .select(
      'id, tipo, categoria_id, categoria, classe, classe_nome, valore::text, nota, ' +
        'created_at, valido_fino_a, stato, giorni_alla_scadenza',
    )
    .order('valido_fino_a', { ascending: true });

  if (error !== null) throw new Error(`Lettura obiettivi fallita: ${error.message}`);
  return comeArray<RigaObiettivo>(data);
}

export type NuovoObiettivo = {
  tipo: TipoObiettivo;
  categoriaId?: string | null;
  classe?: string | null;
  valore?: string | null;
  nota?: string | null;
  /** Quanti mesi vale. Sei se non detto: vedi la nota sulla scadenza. */
  mesi?: number | null;
};

export async function creaObiettivo(o: NuovoObiettivo): Promise<string> {
  if (!TIPI_OBIETTIVO.includes(o.tipo)) {
    throw new ObiettivoNonValido(`Tipo di obiettivo sconosciuto: ${o.tipo}.`);
  }

  const mesi = o.mesi === null || o.mesi === undefined ? 6 : o.mesi;
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 60) {
    throw new ObiettivoNonValido('La durata deve stare fra 1 e 60 mesi.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('obiettivi')
    .insert({
      tipo: o.tipo,
      categoria_id: o.categoriaId ?? null,
      classe: o.classe ?? null,
      valore: o.valore ?? null,
      nota: o.nota ?? null,
      valido_fino_a: fraMesi(mesi),
    })
    .select('id')
    .single<{ id: string }>();

  // La coerenza fra tipo, bersaglio e valore la impone il `check` della 0055,
  // che e' anche l'unico posto che la conosce: ripeterla qui vorrebbe dire due
  // elenchi della stessa regola, e quello in TypeScript sarebbe scavalcabile
  // chiamando la tabella per un'altra strada.
  if (error !== null) throw new ObiettivoNonValido(error.message);
  return data.id;
}

/** Rinnovare non e' modificare: sposta solo la scadenza in avanti. */
export async function rinnovaObiettivo(id: string, mesi = 6): Promise<boolean> {
  if (!Number.isInteger(mesi) || mesi < 1 || mesi > 60) {
    throw new ObiettivoNonValido('La durata deve stare fra 1 e 60 mesi.');
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('obiettivi')
    .update({ valido_fino_a: fraMesi(mesi) })
    .eq('id', id)
    .select('id');

  if (error !== null) throw new ObiettivoNonValido(error.message);
  return comeArray<{ id: string }>(data).length > 0;
}

export async function eliminaObiettivo(id: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('obiettivi').delete().eq('id', id).select('id');
  if (error !== null) throw new ObiettivoNonValido(error.message);
  return comeArray<{ id: string }>(data).length > 0;
}

/**
 * La data fra N mesi, come giorno civile.
 *
 * Con anno e mese come interi invece di `setMonth`: un `Date` letto in UTC e
 * riletto in `Europe/Rome` puo' tornare al giorno prima, ed e' la stessa
 * conversione che le regole di correttezza vietano su `booking_date`.
 *
 * Il giorno si limita all'ultimo del mese di arrivo: «fra un mese» dal 31 marzo
 * e' il 30 aprile, non il 1° maggio.
 */
export function fraMesi(mesi: number, oggi = new Date()): string {
  const iso = oggi.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const anno = Number(iso.slice(0, 4));
  const mese = Number(iso.slice(5, 7));
  const giorno = Number(iso.slice(8, 10));

  const totale = mese - 1 + mesi;
  const annoDopo = anno + Math.floor(totale / 12);
  const meseDopo = (totale % 12) + 1;
  const ultimo = new Date(Date.UTC(annoDopo, meseDopo, 0)).getUTCDate();
  const giornoDopo = Math.min(giorno, ultimo);

  return `${String(annoDopo).padStart(4, '0')}-${String(meseDopo).padStart(2, '0')}-${String(giornoDopo).padStart(2, '0')}`;
}
