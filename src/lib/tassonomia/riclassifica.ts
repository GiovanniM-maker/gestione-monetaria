import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { chiediAlModello, estraiArrayJson, modelloInUso } from '@/lib/ai/modello';
import { applicaTassonomia } from './applica';
import { CONTESTI } from './interpreta';
import { leggiClassi } from './classi';
import type { CategoryRow, Context, Discretion } from '@/lib/db/types';

/**
 * Rifare la classificazione di un esercente, ora che si sa cos'è.
 *
 * ---------------------------------------------------------------------------
 * Il caso
 * ---------------------------------------------------------------------------
 * `Bruno Spa Modica` è oggi in `casa`/`essenziale`, perché il modello — che
 * aveva solo quel nome — ha ragionato dall'importo: _«importo alto suggerisce
 * spesa casa»_. La ricerca ha trovato «Bruno Elettrodomestici S.r.l. a Modica
 * (RG)». Con quel fatto davanti la risposta cambia, e cambia in modo
 * verificabile invece che plausibile.
 *
 * ---------------------------------------------------------------------------
 * Chi non si tocca, e perché è la parte importante
 * ---------------------------------------------------------------------------
 * Solo gli esercenti **proposti dal modello e mai confermati da una persona**.
 * È il patto delle regole di correttezza — «le correzioni manuali dell'utente
 * sono sacre» — applicato agli esercenti invece che alle transazioni.
 *
 * Il filtro sta in `v_esercenti_da_riclassificare` e **anche** nella `where` di
 * `riclassifica_esercente`, e la ripetizione è voluta: fra il momento in cui si
 * legge la lista e quello in cui si scrive passa una chiamata al modello, cioè
 * qualche secondo in cui l'utente può aver confermato quell'esercente dal
 * telefono. La vista decide chi chiedere, la funzione decide chi scrivere.
 *
 * ---------------------------------------------------------------------------
 * Resta una proposta
 * ---------------------------------------------------------------------------
 * `origine` resta `ai` e `confermato_at` resta nullo. Una classificazione
 * meglio informata è pur sempre una classificazione che nessuno ha approvato,
 * e marcarla come confermata sarebbe far dire all'utente una cosa che non ha
 * detto. Su `/revisione` continua a comparire come da guardare — con, in più,
 * la fonte da cui viene.
 */

/**
 * Quanti per chiamata.
 *
 * Più piccolo del lotto delle proposte (quindici), perché ogni voce porta con
 * sé la descrizione trovata: dieci descrizioni da seicento caratteri sono già
 * un prompt sostanzioso, e un prompt lungo fa peggiorare l'aderenza al formato
 * prima che la qualità del giudizio.
 */
const LOTTO = 10;

const SISTEMA = `Sei un classificatore di spese bancarie personali, in italiano.

Per ogni esercente ricevi il nome così come lo scrive la banca, la classificazione che gli era
stata data **indovinando**, e una descrizione trovata su internet. La descrizione è il fatto
nuovo: serve a sostituire un'ipotesi con un'informazione.

REGOLE ASSOLUTE:
1. Rispondi SOLO con un array JSON, senza testo attorno.
2. Usa esclusivamente gli slug di categoria elencati. Uno slug inventato viene scartato.
3. Se la descrizione NON riguarda quell'esercente — parla di un'altra azienda, o solo del paese,
   o è generica — metti "sicuro": false e lascia la classificazione attuale. Una descrizione che
   non c'entra è peggio di nessuna descrizione: non aggiungerci sopra un ragionamento.
4. NON dedurre niente dall'importo o dal numero di movimenti: non li ricevi, e non è un caso.
   Un negozio non diventa "casa" perché ci si spende tanto.
5. "motivo" deve citare cosa nella descrizione ti ha fatto decidere. Se non sai citare niente,
   allora non hai deciso: metti "sicuro": false.

FORMATO di ogni voce:
{"esercente":"...", "categoria":"slug", "discrezionalita":"uno degli slug di classe elencati",
 "contesto":"personale|business", "abbonamento":true|false, "motivo":"...", "sicuro":true|false}`;

export type EsitoRiclassificazione = {
  esaminati: number;
  inviati: number;
  cambiati: number;
  invariati: number;
  scartati: number;
  /** Chi è stato confermato da una persona mentre chiedevamo. */
  saltati: number;
  rimasti: number;
  costo: number | null;
  modello: string;
  cambi: { esercente: string; da: string; a: string; motivo: string }[];
  errori: string[];
};

type RigaDaRifare = {
  merchant_id: string;
  esercente: string;
  descrizione_trovata: string;
  categoria_attuale: string | null;
  discrezionalita_attuale: string | null;
  contesto_attuale: string | null;
  abbonamento_attuale: boolean;
};

export async function riclassificaConLeProve(): Promise<EsitoRiclassificazione> {
  const supabase = await createSupabaseServerClient();
  const esito: EsitoRiclassificazione = {
    esaminati: 0,
    inviati: 0,
    cambiati: 0,
    invariati: 0,
    scartati: 0,
    saltati: 0,
    rimasti: 0,
    costo: null,
    modello: modelloInUso(),
    cambi: [],
    errori: [],
  };

  const [{ data: righe }, { data: categorie }, classi] = await Promise.all([
    supabase
      .from('v_esercenti_da_riclassificare')
      .select(
        'merchant_id, esercente, descrizione_trovata, categoria_attuale, ' +
          'discrezionalita_attuale, contesto_attuale, abbonamento_attuale',
      )
      .limit(LOTTO),
    supabase.from('categories').select('*').eq('is_archived', false).order('slug'),
    leggiClassi(),
  ]);

  const lotto = comeArray<RigaDaRifare>(righe);
  const albero = comeArray<CategoryRow>(categorie);
  const classiValide = new Set(classi.filter((c) => !c.is_archived).map((c) => c.slug));
  esito.esaminati = lotto.length;

  if (lotto.length === 0 || albero.length === 0) return esito;

  const slugValidi = new Set(albero.map((c) => c.slug));
  esito.inviati = lotto.length;

  let voci: unknown[];
  try {
    const risposta = await chiediAlModello({
      system: SISTEMA,
      prompt:
        'CATEGORIE AMMESSE (slug):\n' +
        albero.map((c) => `- ${c.slug}: ${c.name}`).join('\n') +
        '\n\nCLASSI DI DISCREZIONALITÀ AMMESSE (slug):\n' +
        classi
          .filter((c) => !c.is_archived)
          .map(
            (c) => `- ${c.slug}: ${c.nome}${c.descrizione === null ? '' : ` — ${c.descrizione}`}`,
          )
          .join('\n') +
        '\n\nESERCENTI DA RICLASSIFICARE:\n' +
        JSON.stringify(
          lotto.map((r) => ({
            esercente: r.esercente,
            classificazione_indovinata: {
              categoria: r.categoria_attuale,
              discrezionalita: r.discrezionalita_attuale,
              contesto: r.contesto_attuale,
              abbonamento: r.abbonamento_attuale,
            },
            trovato_su_internet: r.descrizione_trovata,
          })),
          null,
          1,
        ),
      maxTokens: 2000,
    });
    esito.costo = risposta.costo;
    voci = estraiArrayJson(risposta.testo);
  } catch (errore) {
    esito.errori.push(errore instanceof Error ? errore.message : String(errore));
    return esito;
  }

  const perNome = new Map(lotto.map((r) => [r.esercente.trim().toLowerCase(), r]));

  for (const grezza of voci) {
    const v = grezza as Record<string, unknown>;
    const riga = perNome.get(
      String(v['esercente'] ?? '')
        .trim()
        .toLowerCase(),
    );

    if (riga === undefined) {
      esito.scartati += 1;
      if (esito.errori.length < 5) {
        esito.errori.push(`Esercente non richiesto: ${String(v['esercente'])}`);
      }
      continue;
    }

    // Il modello dichiara lui stesso di non essere sicuro: si lascia com'è.
    // È la valvola che in Fase 4 è stata misurata funzionare — compariva su
    // quasi tutte le voci discutibili.
    if (v['sicuro'] !== true) {
      esito.invariati += 1;
      continue;
    }

    const categoria = String(v['categoria'] ?? '');
    const discrezionalita = String(v['discrezionalita'] ?? '') as Discretion;
    const contesto = String(v['contesto'] ?? '') as Context;

    if (
      !slugValidi.has(categoria) ||
      !classiValide.has(discrezionalita) ||
      !CONTESTI.includes(contesto)
    ) {
      esito.scartati += 1;
      if (esito.errori.length < 5) {
        esito.errori.push(
          `${riga.esercente}: valori non ammessi (${categoria} / ${discrezionalita} / ${contesto})`,
        );
      }
      continue;
    }

    // Niente da cambiare: la ricerca ha confermato l'ipotesi. È un esito buono,
    // non uno spreco — ora quella classificazione ha una fonte.
    if (
      categoria === riga.categoria_attuale &&
      discrezionalita === riga.discrezionalita_attuale &&
      contesto === riga.contesto_attuale
    ) {
      esito.invariati += 1;
      continue;
    }

    const { data: scritto, error } = await supabase.rpc('riclassifica_esercente', {
      p_merchant_id: riga.merchant_id,
      p_categoria_slug: categoria,
      p_discrezionalita: discrezionalita,
      p_contesto: contesto,
      p_abbonamento: v['abbonamento'] === true,
      p_motivazione: typeof v['motivo'] === 'string' ? v['motivo'].slice(0, 300) : null,
    });

    if (error !== null) {
      esito.scartati += 1;
      if (esito.errori.length < 5) esito.errori.push(`${riga.esercente}: ${error.message}`);
      continue;
    }

    // `false` significa che nel frattempo una persona ha confermato
    // l'esercente. Non è un errore: è il patto che ha funzionato.
    if (scritto !== true) {
      esito.saltati += 1;
      continue;
    }

    esito.cambiati += 1;
    esito.cambi.push({
      esercente: riga.esercente,
      da: `${riga.categoria_attuale ?? 'senza categoria'} / ${riga.discrezionalita_attuale ?? '—'}`,
      a: `${categoria} / ${discrezionalita}`,
      motivo: typeof v['motivo'] === 'string' ? v['motivo'] : '',
    });
  }

  // La tassonomia si riapplica una volta sola alla fine: la classificazione
  // vive sull'esercente, ma va riscritta su ogni sua transazione o gli
  // aggregati continuerebbero a usare quella vecchia.
  if (esito.cambiati > 0) await applicaTassonomia();

  const { count } = await supabase
    .from('v_esercenti_da_riclassificare')
    .select('merchant_id', { count: 'exact', head: true });
  esito.rimasti = count ?? 0;

  return esito;
}
