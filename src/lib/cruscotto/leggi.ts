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
  /**
   * Le classi del mese. Vengono dalla **vista**, non dalla funzione delle
   * variazioni: i numeri devono esistere anche se il confronto non c'e'.
   */
  classi: readonly RigaClasse[];
  /** Le variazioni per classe, da agganciare per `discrezionalita` + `contesto`. */
  variazioniClassi: readonly VariazioneClasse[];
  categorie: readonly RigaCategoria[];
  /** Le variazioni per categoria, da agganciare all'albero per `category_id`. */
  variazioniCategorie: readonly VariazioneCategoria[];
  esercenti: readonly RigaEsercente[];
  /** Le variazioni per esercente, da agganciare all'elenco per `merchant_id`. */
  variazioniEsercenti: readonly VariazioneEsercente[];
  /**
   * Perche' le frecce non ci sono, quando non ci sono.
   *
   * Va detto in schermata e non ingoiato: le cifre restano giuste, ma una
   * colonna di confronti sparita senza spiegazione fa dubitare di tutto il
   * resto — ed e' successo davvero, il giorno in cui la `0036` non era ancora
   * stata applicata.
   */
  variazioniMancanti: string | null;
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

  // Fino a che giorno arrivano i dati di questo mese. Decide la finestra di
  // confronto: ogni cifra della schermata deve parlare degli stessi giorni, o
  // le frecce e il totale in cima raccontano due mesi diversi.
  //
  // ---------------------------------------------------------------------
  // Perche' le letture sono in due sole ondate e non in cinque
  // ---------------------------------------------------------------------
  // Il database risponde in 2-17 ms, misurati. Quello che si paga e' il
  // **numero di andate e ritorno**, non il lavoro che fanno: fra un'ondata e
  // la successiva ci sta un giro di rete intero, e prima erano cinque in fila.
  //
  // Solo due letture dipendono davvero da qualcosa: `giorniCoperti` serve alla
  // finestra, e la finestra serve alle variazioni e al confronto. Tutto il
  // resto non aspetta niente e non deve aspettare nessuno.
  const [
    giorno,
    classi,
    categorie,
    esercenti,
    ricorrente,
    entrate,
    stato,
    daConfermare,
    avvisiNuovi,
  ] = await Promise.all([
    finestraDiConfronto(mese),
    leggiClassi(mese),
    leggiCategorie(mese),
    leggiEsercenti(mese),
    leggiRicorrente(),
    leggiEntrate(mese),
    leggiStatoSistema(),
    quanteDaConfermare(),
    leggiAvvisi(true),
  ]);

  const { giorniCoperti, finestra } = giorno;
  const avvisi = avvisiNuovi.filter((a) => !GIA_SUL_CRUSCOTTO.includes(a.type));

  const [variazioniClassi, variazioniCategorie, variazioniEsercenti, confronto] = await Promise.all(
    [
      leggiVariazioniClassi(mese, finestra),
      leggiVariazioniCategorie(mese, finestra),
      leggiVariazioniEsercenti(mese, finestra, ESERCENTI_MOSTRATI),
      finestra === null ? Promise.resolve(null) : leggiConfronto(mese, finestra),
    ],
  );

  return {
    mese,
    mesePrecedente,
    mesiDisponibili,
    totali,
    classi,
    variazioniClassi: variazioniClassi.righe,
    categorie,
    variazioniCategorie: variazioniCategorie.righe,
    esercenti,
    variazioniEsercenti: variazioniEsercenti.righe,
    variazioniMancanti:
      variazioniClassi.errore ?? variazioniCategorie.errore ?? variazioniEsercenti.errore,
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

/**
 * Le classi del mese, dalla vista della 0019.
 *
 * Era stata tolta quando le variazioni hanno cominciato a portare anche gli
 * importi, e toglierla e' stato uno sbaglio: il giorno in cui la funzione non
 * c'era, il cruscotto ha mostrato **zero euro spesi**. Le viste sono i numeri,
 * le funzioni delle variazioni sono il commento — e un commento che manca non
 * deve poter cancellare cio' che commenta.
 */
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
