import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { meseDaData } from './mesi';
import { leggiStatoSistema, type RigaStato } from '@/lib/movimenti/cerca';
import type { RigaMetrica } from '@/lib/abbonamenti/formato';

/**
 * Le letture del cruscotto.
 *
 * Nessun aggregato si calcola qui: ogni somma arriva gia' fatta dalle viste
 * della 0019. Questo modulo sceglie il mese e mette in fila le query, e se un
 * giorno il copilot della Fase 10 dovra' rispondere a «quanto ho speso in
 * ristoranti a marzo» interroghera' esattamente le stesse viste.
 *
 * Le colonne `numeric` si chiedono **sempre** con `::text`: PostgREST le
 * serializza come numero JSON, e un importo passato da un float e' un importo
 * di cui non ci si puo' piu' fidare.
 */

export type RigaTotaleMese = {
  mese: string;
  spesa: string;
  movimenti: number;
  senza_cambio: number;
  senza_categoria: number;
  spesa_senza_categoria: string;
};

export type RigaClasse = {
  discrezionalita: string;
  contesto: string;
  spesa: string;
  movimenti: number;
};

export type RigaCategoria = {
  category_id: string;
  categoria: string;
  slug: string;
  parent_id: string | null;
  sort_order: number | null;
  spesa: string;
  movimenti: number;
  spesa_diretta: string;
  movimenti_diretti: number;
};

export type RigaEsercente = {
  merchant_id: string | null;
  esercente: string;
  discrezionalita: string;
  contesto: string;
  spesa: string;
  movimenti: number;
};

export type RigaEntrate = {
  mese: string;
  entrate: string;
  movimenti: number;
  senza_cambio: number;
};

export type Cruscotto = {
  mese: string;
  mesePrecedente: string | null;
  /** Tutti i mesi con almeno un movimento, dal piu' vecchio. */
  mesiDisponibili: readonly string[];
  totali: readonly RigaTotaleMese[];
  classi: readonly RigaClasse[];
  classiPrecedenti: readonly RigaClasse[];
  categorie: readonly RigaCategoria[];
  esercenti: readonly RigaEsercente[];
  ricorrente: readonly RigaMetrica[];
  /** Le entrate del mese, come denominatore. Non cambiano la metrica principale. */
  entrate: RigaEntrate | null;
  stato: readonly RigaStato[];
};

/** Quanti esercenti si mostrano. Oltre, la lista smette di essere leggibile. */
const ESERCENTI_MOSTRATI = 20;

/**
 * Legge tutto quello che serve a disegnare un mese.
 *
 * `meseChiesto` nullo significa «l'ultimo con dei dati», e non «il mese
 * corrente»: il primo giorno del mese il mese corrente e' quasi vuoto, e
 * aprire il cruscotto su una schermata a zero fa sembrare rotta
 * l'applicazione.
 */
export async function leggiCruscotto(meseChiesto: string | null): Promise<Cruscotto> {
  const supabase = await createSupabaseServerClient();

  const { data: totaliGrezzi } = await supabase
    .from('v_monthly_totals')
    .select(
      'mese, spesa::text, movimenti, senza_cambio, senza_categoria, spesa_senza_categoria::text',
    )
    .order('mese', { ascending: true });

  const totali = comeArray<RigaTotaleMese>(totaliGrezzi).map((r) => ({
    ...r,
    mese: meseDaData(r.mese) ?? r.mese,
  }));

  const mesiDisponibili = totali.map((r) => r.mese);
  const ultimo = mesiDisponibili[mesiDisponibili.length - 1] ?? null;

  // Un mese chiesto ma senza dati si mostra comunque, vuoto: se lo si
  // reindirizzasse all'ultimo pieno, chi ci arriva da un collegamento
  // crederebbe di guardare un mese diverso da quello che ha chiesto.
  const mese = meseChiesto ?? ultimo ?? new Date().toISOString().slice(0, 7);
  const indice = mesiDisponibili.indexOf(mese);
  const mesePrecedente = indice > 0 ? (mesiDisponibili[indice - 1] ?? null) : null;

  const [classi, classiPrecedenti, categorie, esercenti, ricorrente, entrate, stato] =
    await Promise.all([
      leggiClassi(mese),
      mesePrecedente === null ? Promise.resolve([]) : leggiClassi(mesePrecedente),
      leggiCategorie(mese),
      leggiEsercenti(mese),
      leggiRicorrente(),
      leggiEntrate(mese),
      leggiStatoSistema(),
    ]);

  return {
    mese,
    mesePrecedente,
    mesiDisponibili,
    totali,
    classi,
    classiPrecedenti,
    categorie,
    esercenti,
    ricorrente,
    entrate,
    stato,
  };
}

/**
 * Le entrate del mese.
 *
 * Servono come **denominatore**, non come oggetto: «606 €/mese di voluttuario
 * ricorrente» significa cose molto diverse su entrate da 2.000 o da 6.000, e
 * senza il denominatore quel numero non si sa se e' tanto.
 */
async function leggiEntrate(mese: string): Promise<RigaEntrate | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_monthly_income')
    .select('mese, entrate::text, movimenti, senza_cambio')
    .eq('mese', primoGiorno(mese))
    .maybeSingle();
  return (data as RigaEntrate | null) ?? null;
}

/** Il primo giorno del mese, che e' come la vista lo espone. */
function primoGiorno(mese: string): string {
  return `${mese}-01`;
}

async function leggiClassi(mese: string): Promise<readonly RigaClasse[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_monthly_by_discretion')
    .select('discrezionalita, contesto, spesa::text, movimenti')
    .eq('mese', primoGiorno(mese))
    .order('spesa', { ascending: true });
  return comeArray<RigaClasse>(data);
}

async function leggiCategorie(mese: string): Promise<readonly RigaCategoria[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_monthly_by_category')
    .select(
      'category_id, categoria, slug, parent_id, sort_order, spesa::text, movimenti, ' +
        'spesa_diretta::text, movimenti_diretti',
    )
    .eq('mese', primoGiorno(mese))
    .order('spesa', { ascending: true });
  return comeArray<RigaCategoria>(data);
}

async function leggiEsercenti(mese: string): Promise<readonly RigaEsercente[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_monthly_by_merchant')
    .select('merchant_id, esercente, discrezionalita, contesto, spesa::text, movimenti')
    .eq('mese', primoGiorno(mese))
    .order('spesa', { ascending: true })
    .limit(ESERCENTI_MOSTRATI);
  return comeArray<RigaEsercente>(data);
}

async function leggiRicorrente(): Promise<readonly RigaMetrica[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_recurring_monthly_cost_by_discretion')
    .select('tipo, discrezionalita, contesto, ricorrenze, costo_mensile::text');
  return comeArray<RigaMetrica>(data);
}
