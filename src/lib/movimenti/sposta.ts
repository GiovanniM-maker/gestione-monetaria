import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { applicaTassonomia } from '@/lib/tassonomia/applica';
import type { Context, Discretion } from '@/lib/db/types';
import { messaggioUtente } from '@/lib/db/messaggio';

/**
 * Spostare una singola transazione su un altro esercente.
 *
 * ---------------------------------------------------------------------------
 * Perché non basta la tassonomia
 * ---------------------------------------------------------------------------
 * La Fase 4 abbina gli esercenti dalle **etichette** della banca, e funziona
 * finché due cose diverse hanno etichette diverse. Su `Apple` non è così: sotto
 * `apple.com/bill` convivono undici canoni iCloud da 2,99 e cinque acquisti di
 * aprile per 444,65 €, con lo stesso identico testo e lo stesso `CARD_PAYMENT`.
 * Nessuna regola sulle stringhe può separarli, nemmeno in linea di principio.
 *
 * L'informazione che li distingue non è nei dati bancari: è nella testa di chi
 * ha comprato. È lo stesso caso del computer da Euronics scritto in `CLAUDE.md`
 * dalla Fase 4, e la stessa situazione di `own_counterparties` — l'input umano
 * qui non è una scorciatoia, è l'unica fonte.
 *
 * ---------------------------------------------------------------------------
 * Perché conta più di quanto sembri
 * ---------------------------------------------------------------------------
 * L'esercente è ciò su cui il rilevatore delle ricorrenze raggruppa. Con i
 * cinque acquisti dentro la serie, `amount_stability` crolla a 0,00, il ramo
 * del canone non scatta, e Apple risulta costare 44,94 €/mese invece di 2,99 —
 * quaranta euro che finiscono nella riga **abbonamenti**, cioè in «quanto si
 * libera con un gesto», dove non c'è nessun gesto che li liberi.
 */

export class SpostamentoNonValido extends Error {}

export type NuovoEsercente = {
  nome: string;
  categoriaId?: string | null;
  discrezionalita?: Discretion | null;
  contesto?: Context | null;
  abbonamento?: boolean;
};

/** Crea un esercente **senza alias**, o restituisce quello omonimo. */
export async function creaEsercente(nuovo: NuovoEsercente): Promise<string> {
  const nome = nuovo.nome.trim();
  if (nome === '') throw new SpostamentoNonValido("Serve il nome dell'esercente.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('crea_esercente', {
    p_nome: nome,
    p_categoria_id: nuovo.categoriaId ?? null,
    p_discrezionalita: nuovo.discrezionalita ?? null,
    p_contesto: nuovo.contesto ?? null,
    p_abbonamento: nuovo.abbonamento ?? false,
  });

  if (error !== null)
    throw new SpostamentoNonValido(
      messaggioUtente(error, 'Non e’ stato possibile spostare questo movimento.'),
    );
  if (typeof data !== 'string') throw new Error('Creazione esercente senza identificativo.');
  return data;
}

export type RichiestaSpostamento = {
  /**
   * Uno o più movimenti, verso la **stessa** destinazione.
   *
   * Il plurale non è una comodità: i casi veri arrivano in gruppo. I cinque
   * acquisti di aprile su `Apple` vanno tutti insieme nello stesso posto, e
   * cinque operazioni separate vorrebbero dire cinque conferme, cinque
   * riapplicazioni della tassonomia — che è la parte lenta — e la possibilità
   * di fermarsi a metà lasciando la serie ancora sporca.
   */
  ids: readonly string[];
  /** `null` toglie l'esercente: le righe escono dalle ricorrenze. */
  merchantId: string | null;
  /** Dati per crearlo al volo, quando non esiste ancora. */
  nuovo?: NuovoEsercente;
};

/**
 * Sposta i movimenti e **rilancia la categorizzazione una volta sola**.
 *
 * Il rilancio costa qualche secondo e serve: le righe spostate sono protette da
 * `manually_categorized`, ma il resto della tassonomia va riapplicato perché un
 * esercente nuovo cambia i conteggi di copertura. È lo stesso motivo per cui
 * `assegnaEtichetta` la rilancia invece di aggiornare le sole righe toccate —
 * un secondo percorso di abbinamento, scritto qui e leggermente diverso da
 * quello vero, è il modo classico per farli divergere.
 *
 * Alla fine e non a ogni riga: cinque rilanci sugli stessi millecinquecento
 * movimenti darebbero lo stesso risultato cinque volte più lentamente.
 */
export async function spostaMovimenti(richiesta: RichiestaSpostamento): Promise<number> {
  const ids = richiesta.ids.filter((id) => typeof id === 'string' && id.trim() !== '');
  if (ids.length === 0) throw new SpostamentoNonValido('Nessun movimento indicato.');

  let merchantId = richiesta.merchantId;
  if (merchantId === null && richiesta.nuovo !== undefined) {
    merchantId = await creaEsercente(richiesta.nuovo);
  }

  const supabase = await createSupabaseServerClient();

  for (const id of ids) {
    const { error } = await supabase.rpc('sposta_movimento', {
      p_id: id,
      p_merchant_id: merchantId,
    });
    // Si ferma alla prima riga che fallisce invece di proseguire: metà gruppo
    // spostato è uno stato peggiore di nessuno, perché la serie resta sporca e
    // non si vede più quali righe mancano.
    if (error !== null) throw new SpostamentoNonValido(`Spostamento fallito: ${error.message}`);
  }

  await applicaTassonomia();
  return ids.length;
}

/** Un movimento solo. È il caso della scheda, dove si guarda una riga per volta. */
export async function spostaMovimento(
  richiesta: Omit<RichiestaSpostamento, 'ids'> & { id: string },
): Promise<void> {
  const { id, ...resto } = richiesta;
  await spostaMovimenti({ ...resto, ids: [id] });
}

export type EsercenteMinimo = {
  id: string;
  esercente: string;
  categoria: string | null;
  discrezionalita: string | null;
  contesto: string | null;
  abbonamento: boolean;
};

/** Gli esercenti fra cui scegliere, per la scheda del movimento. */
export async function cercaEsercenti(testo: string): Promise<readonly EsercenteMinimo[]> {
  const cercato = testo.trim();
  if (cercato === '') return [];

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('merchants')
    .select('id, canonical_name, discretion, context, is_subscription, categories(name)')
    // `%` e `_` sono i jolly di `like`: senza scudo, un testo che li contiene
    // farebbe rispondere l'intera tabella.
    .ilike('canonical_name', `%${cercato.replace(/[%_\\]/g, '\\$&')}%`)
    .order('canonical_name')
    .limit(20);

  return comeArray<Record<string, unknown>>(data).map((m) => ({
    id: String(m['id']),
    esercente: String(m['canonical_name']),
    categoria: (m['categories'] as { name?: string } | null)?.name ?? null,
    discrezionalita: (m['discretion'] as string | null) ?? null,
    contesto: (m['context'] as string | null) ?? null,
    abbonamento: m['is_subscription'] === true,
  }));
}
