import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { chiediAlModello, estraiArrayJson, modelloInUso } from '@/lib/ai/modello';
import { selezionaInviabili } from './persone';
import { interpretaProposta, type Proposta } from './interpreta';
import type { CategoryRow } from '@/lib/db/types';

/**
 * Lo strato che mancava: il modello propone una classificazione per gli
 * esercenti mai visti prima.
 *
 * **Non applica la tassonomia.** La prima versione lo faceva a fine di ogni
 * fetta, e rilanciare la categorizzazione su duemila movimenti dopo ogni lotto
 * da venticinque nomi rendeva la richiesta lentissima — al punto che il browser
 * mollava con un «Load failed» che sembrava un problema di rete. Il costo della
 * richiesta non era il modello: era il lavoro che ci avevo attaccato dietro.
 *
 * Ora la fetta fa una cosa sola: chiedere e scrivere gli alias. La
 * categorizzazione la lancia il chiamante, una volta, alla fine — ed e' un
 * pulsante che esiste gia'.
 *
 * Sta **dopo** le regole deterministiche, mai prima. Un esercente già
 * conosciuto non viene chiesto di nuovo — la sua risposta è già scritta in
 * `merchant_aliases`, e quella è la memoria che rende l'automatismo
 * sostenibile: senza, si pagherebbe una chiamata al modello ogni volta che si
 * ordina da Deliveroo.
 *
 * Cosa esce da qui verso l'esterno, e solo questo (regola 8):
 * **il nome dell'esercente, quante volte compare, quanto è stato speso.**
 * Niente IBAN, niente descrizioni grezze, niente ultime cifre della carta, e
 * soprattutto nessun nome di controparte di bonifico privato — filtrato prima
 * della chiamata da `selezionaInviabili`, che si basa sul tipo di operazione e
 * non su come è scritto il nome.
 */

/**
 * Quante etichette per chiamata HTTP.
 *
 * **Una sola**, e non tutte: con 374 etichette servirebbero dieci chiamate al
 * modello in sequenza dentro la stessa invocazione, e Vercel la interrompe a
 * meta'. Il browser riceve un 504 con dentro dell'HTML, `response.json()`
 * esplode, e l'utente legge "errore di rete" — che e' vero e non dice niente.
 *
 * Quindi lo stesso schema del backfill: il server fa una fetta e dice se ha
 * finito, il browser richiama. E' gia' il modo in cui questa applicazione
 * scarica due anni di movimenti; non c'era ragione di inventarne un altro.
 */
const LOTTO = 15;

const SYSTEM = `Sei un classificatore di spese bancarie personali, in italiano.

Ricevi nomi di esercenti così come li scrive la banca — spesso troncati, con
sigle, numeri di punto vendita o prefissi di incasso — e li assegni a una
categoria di un albero dato.

Regole:
- Rispondi SOLO con un array JSON, senza testo attorno.
- Usa esclusivamente gli slug di categoria che ti vengono elencati.
- "discrezionalita" è una fra: essenziale, investimento, utile, voluttuario.
- "contesto" è: personale oppure business.
- "nome" è il nome commerciale pulito, senza numeri di negozio né sigle di
  incasso: "Lidl 1361" diventa "Lidl", "Sp Blueprint.bj-5353" diventa "Blueprint".
- "frammento" è la parte più corta e distintiva del nome, quella che tornerà
  identica la prossima volta: per "Canva* I04731-63857386" è "canva", per
  "Google*cloud 3nmtdc" è "google cloud". Serve a riconoscere da solo i
  prossimi addebiti dello stesso esercente, quando la banca ci attacca un
  codice diverso ogni volta. Omettilo se il nome non ha parti variabili.
- "abbonamento" è true solo per servizi che si pagano ricorrentemente a canone.
- "motivo" è una frase brevissima che spiega la scelta.
- "sicuro" è false quando il nome NON dice che attività sia (sigle, ragioni
  sociali mute, nomi generici). In quel caso classifica lo stesso con la tua
  ipotesi migliore, ma dichiara false: l'utente vedrà la proposta e deciderà.

Non inventare categorie. Non aggiungere campi.`;

export type EsitoProposte = {
  /** Etichette scoperte in tutto, non solo in questa fetta. */
  esaminate: number;
  trattenute: number;
  /** Quante ne sono state mandate al modello in questa fetta. */
  inviate: number;
  proposte: number;
  scartate: number;
  /** Quante restano da proporre dopo questa fetta. */
  rimaste: number;
  /**
   * `false` se questa fetta non ha prodotto nemmeno una proposta.
   *
   * E' il segnale di arresto del ciclo lato browser: senza, un lotto che
   * fallisce sempre — modello irraggiungibile, risposte tutte invalide —
   * verrebbe richiamato all'infinito sulle stesse etichette.
   */
  progresso: boolean;
  /** Token e costo di questa fetta, quando il fornitore li dichiara. */
  token: number | null;
  costo: number | null;
  modello: string;
  errori: readonly string[];
};

type Candidata = {
  etichetta: string;
  movimenti: number;
  totale: string;
  solo_carta: boolean;
};


/** Esegue **una fetta**. Va richiamata finche' `rimaste` non e' zero. */
export async function proponiClassificazioni(): Promise<EsitoProposte> {
  const supabase = await createSupabaseServerClient();

  const [{ data: candidateGrezze }, { data: categorieGrezze }] = await Promise.all([
    supabase
      .from('v_da_classificare')
      .select('etichetta, movimenti, totale::text, solo_carta')
      .order('totale', { ascending: true }),
    supabase.from('categories').select('*').eq('is_archived', false),
  ]);

  const candidate = comeArray<Candidata>(candidateGrezze);
  const categorie = comeArray<CategoryRow>(categorieGrezze);
  const slugValidi = new Set(categorie.map((c) => c.slug));
  const perEtichetta = new Map(candidate.map((c) => [c.etichetta, c] as const));

  const { inviabili, trattenute } = selezionaInviabili(
    candidate.map((c) => ({ etichetta: c.etichetta, soloCarta: c.solo_carta })),
  );

  const errori: string[] = [];
  const accettate: Proposta[] = [];
  const motiviScarto: string[] = [];
  let scartate = 0;
  let token: number | null = null;
  let costo: number | null = null;

  // Le piu' costose per prime: se qualcosa va storto a meta', si e' comunque
  // classificato cio' che pesa di piu'.
  const lotto = inviabili.slice(0, LOTTO);

  if (lotto.length > 0) {
    try {
      const grezze = await chiediLotto(lotto, categorie, perEtichetta);
      token = grezze.token;
      costo = grezze.costo;
      for (const p of grezze.voci) {
        const esito = interpretaProposta(p, slugValidi, lotto);
        if ('scarto' in esito) {
          scartate += 1;
          // Solo i primi: quindici righe uguali non aggiungono niente. Ma
          // almeno uno deve arrivare a chi guarda, o «15 scartate» resta un
          // numero senza spiegazione — che e' esattamente com'e' andata la
          // prima volta.
          if (motiviScarto.length < 5) motiviScarto.push(esito.scarto);
        } else {
          accettate.push(esito.proposta);
        }
      }
    } catch (errore) {
      errori.push(errore instanceof Error ? errore.message : String(errore));
    }
  }

  await scrivi(accettate);

  return {
    esaminate: candidate.length,
    trattenute: trattenute.length,
    inviate: lotto.length,
    proposte: accettate.length,
    scartate,
    rimaste: Math.max(inviabili.length - accettate.length, 0),
    progresso: accettate.length > 0,
    token,
    costo,
    modello: modelloInUso(),
    errori: [...errori, ...motiviScarto].slice(0, 10),
  };
}

async function chiediLotto(
  etichette: readonly string[],
  categorie: readonly CategoryRow[],
  perEtichetta: ReadonlyMap<string, Candidata>,
): Promise<{ voci: unknown[]; token: number | null; costo: number | null }> {
  const albero = categorie
    .map((c) => `- ${c.slug}: ${c.name}${c.default_discretion === null ? '' : ` (${c.default_discretion})`}`)
    .join('\n');

  // Il payload in JSON, e non in righe formattate.
  //
  // Prima mandavo `- Canva* I04731-63857386 · 1 volte · -12.00 EUR` chiedendo
  // di ricopiare "l'etichetta": il modello ha ricopiato la riga intera, e
  // aveva ragione — in una riga di testo non c'e' niente che dica dove
  // finisce il nome. In JSON il campo ha un nome e un confine.
  //
  // Escono solo questi tre valori (regola 8): nome dell'esercente, quante
  // volte compare, quanto e' stato speso.
  const righe = JSON.stringify(
    etichette.map((e) => {
      const c = perEtichetta.get(e);
      return { etichetta: e, volte: c?.movimenti ?? 0, totale: c?.totale ?? '0' };
    }),
    null,
    1,
  );

  const risposta = await chiediAlModello({
    system: SYSTEM,
    prompt:
      `Categorie disponibili:\n${albero}\n\n` +
      `Esercenti da classificare (array JSON):\n${righe}\n\n` +
      'Rispondi con un array JSON di oggetti con i campi: etichetta, nome, ' +
      'categoria, discrezionalita, contesto, frammento, abbonamento, motivo, sicuro. ' +
      'Una voce per ogni esercente. Il campo "etichetta" va ricopiato ' +
      'IDENTICO dal campo "etichetta" che ti ho dato, senza aggiungere volte, ' +
      'importi o trattini.',
    maxTokens: 8192,
  });

  return {
    voci: estraiArrayJson(risposta.testo),
    token: risposta.token,
    costo: risposta.costo,
  };
}

async function scrivi(proposte: readonly Proposta[]): Promise<void> {
  if (proposte.length === 0) return;
  const supabase = await createSupabaseServerClient();

  const { data: categorie } = await supabase.from('categories').select('id, slug');
  const idPerSlug = new Map(
    comeArray<{ id: string; slug: string }>(categorie).map((c) => [c.slug, c.id] as const),
  );

  for (const p of proposte) {
    const { data: merchant, error } = await supabase
      .from('merchants')
      .upsert(
        {
          canonical_name: p.nome,
          category_id: idPerSlug.get(p.categoria) ?? null,
          discretion: p.discrezionalita,
          context: p.contesto,
          is_subscription: p.abbonamento,
          origine: 'ai',
          confermato_at: null,
          motivazione: p.sicuro ? p.motivo : `${p.motivo} — il nome non dice l'attività, da controllare`,
        },
        { onConflict: 'canonical_norm' },
      )
      .select('id')
      .single<{ id: string }>();

    if (error !== null || merchant === null) continue;

    // Con un frammento l'alias e' `contains` e riconosce anche gli addebiti
    // futuri dello stesso esercente — `Canva* <codice diverso ogni volta>`.
    // Senza, resta `exact` sull'etichetta intera: copre solo quella, ma non
    // puo' pescare movimenti che il modello non ha visto.
    const [pattern, tipo] =
      p.frammento === null ? [p.etichetta, 'exact' as const] : [p.frammento, 'contains' as const];

    await supabase
      .from('merchant_aliases')
      .upsert(
        { merchant_id: merchant.id, pattern, match_type: tipo, priority: 0 },
        { onConflict: 'pattern,match_type' },
      );
  }
}
