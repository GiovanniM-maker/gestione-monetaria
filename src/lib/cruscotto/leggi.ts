import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { meseDaData } from './mesi';
import { leggiStatoSistema, type RigaStato } from '@/lib/movimenti/cerca';
import { confronta, leggiPeriodi, type Confronto, type RigaPeriodo } from './confronto';
import { quanteDaConfermare } from '@/lib/conferma/leggi';
import { GIA_SUL_CRUSCOTTO, leggiAvvisi, type RigaAvviso } from '@/lib/avvisi/leggi';
import type { RigaMetrica } from '@/lib/abbonamenti/formato';
import {
  finestraDiConfronto,
  leggiVariazioniCategorie,
  leggiVariazioniClassi,
  leggiVariazioniEsercenti,
} from './variazioni';
import type { VariazioneCategoria, VariazioneClasse, VariazioneEsercente } from './andamento';

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
  /**
   * Le classi del mese **con la loro variazione**, che arriva calcolata da SQL.
   *
   * Ha sostituito la coppia «classi del mese + classi del mese prima» e la
   * sottrazione fatta qui: il mese prima non e' il termine di paragone giusto —
   * puo' essere stato un mese strano — e la sottrazione era aritmetica in
   * TypeScript su una cosa che le regole vogliono in SQL.
   */
  classi: readonly VariazioneClasse[];
  categorie: readonly RigaCategoria[];
  /** Le variazioni per categoria, da agganciare all'albero per `category_id`. */
  variazioniCategorie: readonly VariazioneCategoria[];
  esercenti: readonly RigaEsercente[];
  /** Le variazioni per esercente, da agganciare all'elenco per `merchant_id`. */
  variazioniEsercenti: readonly VariazioneEsercente[];
  ricorrente: readonly RigaMetrica[];
  /** Le entrate del mese, come denominatore. Non cambiano la metrica principale. */
  entrate: RigaEntrate | null;
  stato: readonly RigaStato[];
  /** Quanti movimenti aspettano una conferma. Zero = niente da fare. */
  daConfermare: number;
  /**
   * Gli avvisi nuovi, tolti quelli che il riquadro di stato qui sopra dice
   * gia'. Un avviso doppio non e' due volte piu' visibile: e' meta' credibile.
   */
  avvisi: readonly RigaAvviso[];
  /**
   * Il confronto sui giorni davvero coperti, presente solo quando il mese e'
   * incompleto. Quando il mese e' finito non serve: si confronta per intero.
   */
  confronto: Confronto | null;
  /** Fino a che giorno del mese arrivano i dati. `null` = mese vuoto. */
  giorniCoperti: number | null;
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

  // Fino a che giorno arrivano i dati di questo mese. Si legge **prima** di
  // tutto il resto, perche' e' cio' che decide la finestra: ogni confronto
  // della schermata deve parlare degli stessi giorni, o le frecce e il totale
  // in cima raccontano due mesi diversi.
  const { giorniCoperti, finestra } = await finestraDiConfronto(mese);

  const [
    classi,
    categorie,
    variazioniCategorie,
    esercenti,
    variazioniEsercenti,
    ricorrente,
    entrate,
    stato,
  ] = await Promise.all([
    leggiVariazioniClassi(mese, finestra),
    leggiCategorie(mese),
    leggiVariazioniCategorie(mese, finestra),
    leggiEsercenti(mese),
    leggiVariazioniEsercenti(mese, finestra, ESERCENTI_MOSTRATI),
    leggiRicorrente(),
    leggiEntrate(mese),
    leggiStatoSistema(),
  ]);

  const [daConfermare, avvisiNuovi] = await Promise.all([quanteDaConfermare(), leggiAvvisi(true)]);
  const avvisi = avvisiNuovi.filter((a) => !GIA_SUL_CRUSCOTTO.includes(a.type));

  const confronto = finestra === null ? null : await leggiConfronto(mese, finestra);

  return {
    mese,
    mesePrecedente,
    mesiDisponibili,
    totali,
    classi,
    categorie,
    variazioniCategorie,
    esercenti,
    variazioniEsercenti,
    ricorrente,
    entrate,
    stato,
    daConfermare,
    avvisi,
    confronto,
    giorniCoperti,
  };
}

/**
 * I primi N giorni di questo mese contro i primi N dei precedenti.
 *
 * Non si proietta a fine mese: «a questo ritmo spenderai X» e'
 * un'estrapolazione travestita da informazione, ed e' lo stesso errore che in
 * Fase 5 dichiarava 8.966 EUR/mese di spesa inesistente. Due finestre della
 * stessa lunghezza sono invece due misure, e si possono confrontare.
 */
async function leggiConfronto(mese: string, giorni: number): Promise<Confronto | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('spesa_nei_primi_giorni', {
    p_giorni: giorni,
    p_mesi: 7,
  });
  if (error !== null) return null;
  return confronta(mese, leggiPeriodi(comeArray<RigaPeriodo>(data)));
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
