import 'server-only';
import { cache } from 'react';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';
import { parseCentesimiTollerante } from '@/lib/money';
import { meseDaData } from '@/lib/cruscotto/mesi';

/**
 * Le letture della «Dove» analitica: quando, e cosa sta cambiando.
 *
 * ---------------------------------------------------------------------------
 * Una serie sola, quattro sorgenti
 * ---------------------------------------------------------------------------
 * «Nel tempo» e' UN grafico che cambia metrica — totale, una classe, una
 * categoria, il ricorrente di un tipo — invece di venti grafici permanenti.
 * Ogni sorgente e' gia' un aggregato SQL (le viste mensili, o le funzioni
 * della 0052): qui si sceglie e si rimonta, non si calcola.
 *
 * L'unica aritmetica e' la somma dei due contesti di una classe, in `bigint`
 * sui centesimi: la stessa che la barra della home fa da sempre, e per la
 * stessa ragione — la vista risponde per (classe, contesto) e la domanda e'
 * sulla classe.
 *
 * Gli errori di RPC si LANCIANO (la regola della 0050): una funzione assente
 * non deve travestirsi da «nessun dato».
 */

export type PuntoMensile = {
  /** `YYYY-MM`. */
  mese: string;
  /** Stringa decimale, come l'ha scritta Postgres o ricomposta dai centesimi. */
  spesa: string;
};

export type PuntoGiornaliero = {
  /** `YYYY-MM-DD`. */
  giorno: string;
  spesa: string;
};

function oErrore<T>(r: { data: unknown; error: { message: string } | null }): readonly T[] {
  if (r.error !== null) throw new Error(r.error.message);
  return comeArray<T>(r.data);
}

/** Da centesimi a stringa decimale, senza passare da un float. */
export function centesimiATesto(valore: bigint): string {
  const negativo = valore < 0n;
  const modulo = negativo ? -valore : valore;
  return `${negativo ? '-' : ''}${modulo / 100n}.${String(modulo % 100n).padStart(2, '0')}`;
}

export const leggiSpesaGiornaliera = cache(
  inCache('spesa-giornaliera', async (sb, mese: string): Promise<readonly PuntoGiornaliero[]> => {
    const esito = await sb.rpc('spesa_giornaliera', { p_mese: `${mese}-01` });
    return oErrore<PuntoGiornaliero>(esito);
  }),
);

export const leggiAndamentoRicorrente = cache(
  inCache('andamento-ricorrente', async (sb, tipo: string): Promise<readonly PuntoMensile[]> => {
    const esito = await sb.rpc('spesa_mensile_ricorrente', { p_tipo: tipo });
    return oErrore<{ mese: string; spesa: string }>(esito).map((r) => ({
      mese: meseDaData(r.mese) ?? r.mese,
      spesa: r.spesa,
    }));
  }),
);

export const leggiAndamentoClasse = cache(
  inCache('andamento-classe', async (sb, classe: string): Promise<readonly PuntoMensile[]> => {
    const esito = await sb
      .from('v_monthly_by_discretion')
      .select('mese, spesa::text')
      .eq('discrezionalita', classe)
      .order('mese', { ascending: true });
    const righe = oErrore<{ mese: string; spesa: string }>(esito);

    // I due contesti si sommano qui, in centesimi. Un mese in cui una riga
    // non si legge NON entra a meta': meglio un buco visibile che un totale
    // dimezzato plausibile.
    const perMese = new Map<string, bigint>();
    const rotti = new Set<string>();
    for (const r of righe) {
      const mese = meseDaData(r.mese) ?? r.mese;
      const c = parseCentesimiTollerante(r.spesa);
      if (c === null) {
        rotti.add(mese);
        continue;
      }
      perMese.set(mese, (perMese.get(mese) ?? 0n) + c);
    }
    return [...perMese.entries()]
      .filter(([mese]) => !rotti.has(mese))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([mese, c]) => ({ mese, spesa: centesimiATesto(c) }));
  }),
);

export const leggiAndamentoCategoria = cache(
  inCache('andamento-categoria', async (sb, id: string): Promise<readonly PuntoMensile[]> => {
    const esito = await sb
      .from('v_monthly_by_category')
      .select('mese, spesa::text')
      .eq('category_id', id)
      .order('mese', { ascending: true });
    return oErrore<{ mese: string; spesa: string }>(esito).map((r) => ({
      mese: meseDaData(r.mese) ?? r.mese,
      spesa: r.spesa,
    }));
  }),
);
