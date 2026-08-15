import 'server-only';
import { cache } from 'react';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';
import { meseDaData } from './mesi';
import { leggiStatoSistema } from '@/lib/movimenti/cerca';
import { confronta, leggiPeriodi, type RigaPeriodo } from './confronto';
import { quanteDaConfermare } from '@/lib/conferma/leggi';
import { GIA_SUL_CRUSCOTTO, leggiAvvisi } from '@/lib/avvisi/leggi';
import {
  finestraDiConfronto,
  leggiVariazioniCategorie,
  leggiVariazioniClassi,
  leggiVariazioniEsercenti,
} from './variazioni';
import type {
  RigaCategoria,
  RigaClasse,
  RigaEntrate,
  RigaEsercente,
  RigaTotaleMese,
} from './leggi';
import type { RigaMetrica } from '@/lib/abbonamenti/formato';

/**
 * Le letture del cruscotto, una per una e deduplicate.
 *
 * ---------------------------------------------------------------------------
 * Perche' non c'e' piu' una funzione sola che legge tutto
 * ---------------------------------------------------------------------------
 * `leggiCruscotto()` leggeva undici cose e le restituiva insieme. Comodo da
 * scrivere, e il motivo per cui la schermata restava bianca fino all'ultima:
 * finche' i dati sono un blocco unico, **la pagina puo' comparire solo quando
 * il piu' lento ha finito**.
 *
 * Spezzate, ogni parte della schermata aspetta soltanto la sua, e le parti
 * arrivano in streaming man mano. Il tempo totale non cambia; il tempo prima di
 * vedere il numerone crolla.
 *
 * ---------------------------------------------------------------------------
 * `cache()` e' cio' che rende sicuro spezzarle
 * ---------------------------------------------------------------------------
 * Due blocchi diversi hanno bisogno della stessa finestra di confronto, e tre
 * hanno bisogno dei mesi disponibili. Senza deduplica, spezzare avrebbe
 * **moltiplicato** le query invece di riordinarle.
 *
 * `cache()` di React memorizza per la durata di **una richiesta**: la seconda
 * chiamata nello stesso render non parte nemmeno. Non e' una cache di dati fra
 * richieste — quella qui non e' possibile, vedi sotto — e' la deduplica di una
 * domanda fatta due volte nello stesso istante.
 *
 * ---------------------------------------------------------------------------
 * E `inCache()` toglie anche il viaggio
 * ---------------------------------------------------------------------------
 * `cache()` dedupica dentro una richiesta; `inCache()` (vedi
 * `supabase/cache.ts`) riusa il risultato **fra** richieste, e lo fa **senza
 * rinunciare a RLS**: il gettone di sessione entra nella chiave della cache e
 * viaggia come `Authorization`, quindi Postgres continua a valutare le policy
 * riga per riga.
 *
 * I due si compongono nell'ordine giusto — `cache(inCache(...))` — cosi' la
 * prima chiamata nel render paga al massimo un giro di rete, e le successive
 * nemmeno quello.
 *
 * Ogni scrittura chiama `scadeTutto()`. Un totale vecchio mostrato come fresco
 * e' il guasto che questa applicazione non si puo' permettere.
 */

const ESERCENTI_MOSTRATI = 20;

const primoGiorno = (mese: string): string => `${mese}-01`;

/** I mesi con dei dati, e i totali di ciascuno. Base di tutto il resto. */
export const leggiTotali = cache(
  inCache('totali', async (sb): Promise<readonly RigaTotaleMese[]> => {
    const { data } = await sb
      .from('v_monthly_totals')
      .select(
        'mese, spesa::text, movimenti, senza_cambio, senza_categoria, spesa_senza_categoria::text',
      )
      .order('mese', { ascending: true });
    return comeArray<RigaTotaleMese>(data).map((r) => ({
      ...r,
      mese: meseDaData(r.mese) ?? r.mese,
    }));
  }),
);

/**
 * Il mese da mostrare, e i suoi vicini.
 *
 * `meseChiesto` nullo significa «l'ultimo con dei dati», non «il mese
 * corrente»: il primo del mese il corrente e' quasi vuoto, e aprire su una
 * schermata a zero fa sembrare rotta l'applicazione.
 */
export const scegliMese = cache(async (meseChiesto: string | null) => {
  const totali = await leggiTotali();
  const mesi = totali.map((r) => r.mese);
  const ultimo = mesi[mesi.length - 1] ?? null;
  const mese = meseChiesto ?? ultimo ?? new Date().toISOString().slice(0, 7);
  const i = mesi.indexOf(mese);
  return {
    mese,
    mesiDisponibili: mesi,
    totali,
    rigaMese: totali.find((t) => t.mese === mese) ?? null,
    mesePrecedente: i > 0 ? (mesi[i - 1] ?? null) : null,
    meseSuccessivo: i >= 0 ? (mesi[i + 1] ?? null) : null,
    inCorso: mese === ultimo,
  };
});

/** La finestra di confronto. Serve a tre blocchi diversi: va deduplicata. */
export const leggiFinestra = cache(finestraDiConfronto);

export const leggiClassi = cache(
  inCache('classi', async (sb, mese: string): Promise<readonly RigaClasse[]> => {
    const { data } = await sb
      .from('v_monthly_by_discretion')
      .select('discrezionalita, contesto, spesa::text, movimenti')
      .eq('mese', primoGiorno(mese))
      .order('spesa', { ascending: true });
    return comeArray<RigaClasse>(data);
  }),
);

export const leggiCategorie = cache(
  inCache('categorie', async (sb, mese: string): Promise<readonly RigaCategoria[]> => {
    const { data } = await sb
      .from('v_monthly_by_category')
      .select(
        'category_id, categoria, slug, parent_id, sort_order, spesa::text, movimenti, ' +
          'spesa_diretta::text, movimenti_diretti',
      )
      .eq('mese', primoGiorno(mese))
      .order('spesa', { ascending: true });
    return comeArray<RigaCategoria>(data);
  }),
);

export const leggiEsercenti = cache(
  inCache('esercenti-del-mese', async (sb, mese: string): Promise<readonly RigaEsercente[]> => {
    const { data } = await sb
      .from('v_monthly_by_merchant')
      .select('merchant_id, esercente, discrezionalita, contesto, spesa::text, movimenti')
      .eq('mese', primoGiorno(mese))
      .order('spesa', { ascending: true })
      .limit(ESERCENTI_MOSTRATI);
    return comeArray<RigaEsercente>(data);
  }),
);

export const leggiRicorrente = cache(
  inCache('ricorrente', async (sb): Promise<readonly RigaMetrica[]> => {
    const { data } = await sb
      .from('v_recurring_monthly_cost_by_discretion')
      .select('tipo, discrezionalita, contesto, ricorrenze, costo_mensile::text');
    return comeArray<RigaMetrica>(data);
  }),
);

export const leggiEntrate = cache(
  inCache('entrate', async (sb, mese: string): Promise<RigaEntrate | null> => {
    const { data } = await sb
      .from('v_monthly_income')
      .select('mese, entrate::text, movimenti, senza_cambio')
      .eq('mese', primoGiorno(mese))
      .maybeSingle();
    return (data as RigaEntrate | null) ?? null;
  }),
);

/**
 * Lo stato del sistema **non** si mette in cache fra richieste.
 *
 * Dice se il consenso bancario sta scadendo e se l'ultima sincronizzazione e'
 * fallita: e' il riquadro che esiste per accorgersi che i dati hanno smesso di
 * arrivare. Un minuto di ritardo su quello e' un minuto in cui l'applicazione
 * dice che va tutto bene mentre non e' vero — l'unico posto dove il dato fermo
 * costa piu' del viaggio che si risparmia.
 */
export const leggiStato = cache(leggiStatoSistema);

export const leggiDaConfermare = cache(quanteDaConfermare);

export const leggiAvvisiNuovi = cache(async () => {
  const avvisi = await leggiAvvisi(true);
  return avvisi.filter((a) => !GIA_SUL_CRUSCOTTO.includes(a.type));
});

/**
 * I primi N giorni di questo mese contro i primi N dei precedenti.
 *
 * Non si proietta a fine mese: «a questo ritmo spenderai X» e'
 * un'estrapolazione travestita da informazione, ed e' lo stesso errore che in
 * Fase 5 dichiarava 8.966 EUR/mese di spesa inesistente.
 */
export const leggiConfronto = cache(async (mese: string) => {
  const { finestra } = await leggiFinestra(mese);
  if (finestra === null) return null;
  const righe = await periodiInCache(finestra);
  return confronta(mese, leggiPeriodi(righe));
});

const periodiInCache = inCache(
  'primi-giorni',
  async (sb, giorni: number): Promise<readonly RigaPeriodo[]> => {
    const { data, error } = await sb.rpc('spesa_nei_primi_giorni', {
      p_giorni: giorni,
      p_mesi: 7,
    });
    if (error !== null) return [];
    return comeArray<RigaPeriodo>(data);
  },
);

export const leggiVariazioni = cache(async (mese: string) => {
  const { finestra } = await leggiFinestra(mese);
  const [classi, categorie, esercenti] = await Promise.all([
    leggiVariazioniClassi(mese, finestra),
    leggiVariazioniCategorie(mese, finestra),
    leggiVariazioniEsercenti(mese, finestra, ESERCENTI_MOSTRATI),
  ]);
  return {
    classi: classi.righe,
    categorie: categorie.righe,
    esercenti: esercenti.righe,
    mancanti: classi.errore ?? categorie.errore ?? esercenti.errore,
  };
});
