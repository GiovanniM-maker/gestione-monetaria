import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import {
  conversaConModello,
  modelloInUso,
  type MessaggioModello,
  type ChiamataStrumento,
} from '@/lib/ai/modello';
import { confermaMovimento } from '@/lib/conferma/leggi';
import { aggiornaMerchant } from '@/lib/tassonomia/assegna';
import { cifreInventate } from './cifre';
import { ArgomentoNonValido, strumento, STRUMENTI } from './strumenti';
import type {
  Grafico,
  MessaggioSalvato,
  Proposta,
  PropostaSalvata,
  StrumentoEseguito,
} from './messaggi';
import type { Context, Discretion } from '@/lib/db/types';

/**
 * Il copilot.
 *
 * ---------------------------------------------------------------------------
 * Il modello sceglie l'operazione, non il numero
 * ---------------------------------------------------------------------------
 * Un giro è: il modello riceve la domanda e l'elenco delle operazioni, ne
 * chiama una o più, ne riceve i risultati, e o continua o risponde. Le cifre
 * arrivano tutte da SQL, come nel report della Fase 9. La differenza è che lì
 * gli aggregati erano decisi da noi, e qui li sceglie lui: può quindi trovarsi
 * senza il numero che gli serve, e la tentazione di calcolarlo è nuova.
 *
 * Contro quella tentazione ci sono tre cose, in ordine di forza:
 *
 * 1. **Non ha i dati per calcolare.** Riceve aggregati finiti, non le righe da
 *    cui vengono — tranne quando chiede esplicitamente i movimenti, e allora
 *    riceve anche il loro totale già sommato.
 * 2. **Il controllo delle cifre.** Ogni risposta viene confrontata con i dati
 *    ricevuti, e le cifre che non c'erano compaiono marcate sotto il messaggio.
 *    È l'unica difesa che non dipende dalla buona volontà del modello.
 * 3. **Le istruzioni.** Che da sole non bastano: nel report della Fase 9 il
 *    modello ha copiato correttamente una mediana e l'ha chiamata media.
 *
 * ---------------------------------------------------------------------------
 * Perché la conversazione si conserva
 * ---------------------------------------------------------------------------
 * Con i dati che il modello ha davvero ricevuto, come `reports.metrics`. Fra sei
 * mesi, davanti a una frase che non torna, senza quei dati non si potrebbe dire
 * se ha sbagliato il modello o la query: sarebbero indistinguibili, e si
 * finirebbe per dubitare di entrambi. È anche ciò che permette di riaprire la
 * conversazione dal telefono il giorno dopo, che è come questa applicazione si
 * usa.
 */

/** Quante volte al massimo il modello può chiamare operazioni prima di rispondere. */
const GIRI_MASSIMI = 4;

/** Quanti messaggi passati si rimandano al modello. */
const MEMORIA = 12;

/** Oltre questa lunghezza il risultato di un'operazione si tronca. */
const LIMITE_RISULTATO = 12_000;

// ---------------------------------------------------------------------------
// Le istruzioni
// ---------------------------------------------------------------------------
// L'albero delle categorie ci va dentro per intero. Trentacinque voci sono
// poche centinaia di token, e valgono un giro di ricerca risparmiato a ogni
// domanda: «quanto ho speso in ristoranti» diventa una chiamata sola invece di
// due, e soprattutto il modello non può sbagliare bersaglio inventando un
// identificativo.

const REGOLE = `Sei il copilota di un'applicazione personale di spese. Rispondi in italiano, con il "tu",
in modo breve e concreto. Chi legge sta guardando un telefono.

REGOLE ASSOLUTE:
1. NON calcolare, stimare, sommare, sottrarre, dividere o convertire NESSUN numero. Ogni cifra che
   scrivi deve comparire, identica, in un risultato che hai ricevuto. Se ti serve un numero che non
   hai, chiama l'operazione che lo produce. Se non esiste un'operazione che lo produce, dillo.
2. NIENTE percentuali, medie o differenze che non siano nei dati. Sono numeri calcolati, e calcolarli
   è vietato anche quando sembra banale.
3. Chiama il numero con il suo nome. Se il dato si chiama "spesa tipica" non scrivere "media": una
   mediana e una media sono due cose diverse, e chiamarla male rende falsa una frase che contiene un
   numero giusto.
4. "un privato" NON significa che il nome sia sconosciuto: significa che un filtro di riservatezza
   l'ha tolto prima che tu lo vedessi, perché quella controparte non va nominata. Se te lo chiedono,
   di' esattamente questo. NON ipotizzare perché manchi — non è un pagamento in contanti, non è un
   dato che la banca non ha mandato, non è un errore: è nascosto apposta e tu non puoi recuperarlo.
   Il movimento resta visibile su /movimenti, dove il nome c'è.
5. Non inventare spiegazioni. Se una spesa è salita e non sai perché, scrivi che è salita e basta.
6. Le scritture non le esegui tu: le prepari, e l'utente le applica con un tocco. Dopo averne
   preparata una, di' cosa hai preparato e che è in attesa. Non dare mai per fatto il cambiamento.
7. NON rispondere con un menu di cosa potresti guardare. Hai gli strumenti: usali e rispondi. Chiedi
   qualcosa solo se senza quella risposta non puoi proprio procedere — e non è quasi mai il caso.

QUANDO CHIEDONO CONSIGLI ("come spendo meno", "dove taglio", "come metto via più soldi"):
- Chiama SUBITO dove_tagliare e rispondi con quello che torna. È la domanda per cui questa
  applicazione esiste: rimandarla all'utente sotto forma di menu è il modo peggiore di trattarla.
- Dai DUE liste separate e dichiaralo: cosa si può DISDIRE (abbonamenti — un gesto, risparmio certo)
  e cosa si può CAMBIARE (abitudini — nessun gesto la risolve). Non sommarle mai.
- Sii concreto: nomina l'esercente e la sua cifra, presa dai dati. Mai un risparmio totale calcolato
  da te — se vuoi un totale, usa quello già presente nel costo ricorrente per classe.
- Parti da usage_verdict = 'non_usato', se ce n'è: si sta pagando per qualcosa già dichiarato inutile.
- Una voce di viaggi con poche occorrenze ravvicinate NON è un'abitudine da cambiare. Dillo.
- Niente prediche e niente consigli generici da manuale ("fai un budget", "porta il pranzo da casa").
  Vale solo quello che si legge nei suoi dati.

QUANDO CHIEDONO UN GRAFICO, o un andamento nel tempo: chiama grafico_mensile. Il grafico compare da
solo sotto la tua risposta, quindi NON descriverlo ("come vedi la linea sale") — commenta i valori.

COSA SAPERE SUI DATI:
- Le uscite sono NEGATIVE. Gli importi sono in euro.
- "Spesa reale" esclude i giroconti fra conti propri, i rimborsi e i conti fuori dai totali. È il
  numero che conta; il resto si vede solo chiedendo tipo "tutti".
- La metrica principale dell'applicazione è il costo ricorrente mensile per classe di
  discrezionalità. ABBONAMENTI e ABITUDINI sono due numeri distinti e NON si sommano mai: un
  abbonamento si disdice con un gesto, un'abitudine si cambia, e sono due azioni diverse.
- Le quattro classi di discrezionalità sono: essenziale, investimento, utile, voluttuario.
  I due contesti sono: personale, business.

FORMA: massimo 150 parole salvo richiesta esplicita. "- " per gli elenchi, "**" per gli importi.
Niente tabelle, niente preamboli.`;

async function istruzioni(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_categorie_albero')
    .select('id, percorso, archiviata')
    .order('percorso');

  const albero = comeArray<{ id: string; percorso: string; archiviata: boolean }>(data)
    .filter((c) => !c.archiviata)
    .map((c) => `${c.percorso} = ${c.id}`)
    .join('\n');

  // La data di oggi va detta: senza, «questo mese» non ha riferimento e il
  // modello userebbe quello del proprio addestramento.
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  return `${REGOLE}\n\nOGGI È IL ${oggi}.\n\nLE CATEGORIE, con il loro identificativo:\n${albero}`;
}

// ---------------------------------------------------------------------------
// Il giro
// ---------------------------------------------------------------------------

export type Turno = {
  conversazioneId: string;
  messaggio: MessaggioSalvato;
  costo: number | null;
};

export function nuovaConversazione(): string {
  return crypto.randomUUID();
}

export async function chiedi(conversazioneId: string, domanda: string): Promise<Turno> {
  const pulita = domanda.trim();
  if (pulita === '') throw new ArgomentoNonValido('La domanda è vuota.');
  if (pulita.length > 2000) throw new ArgomentoNonValido('La domanda è troppo lunga.');

  const supabase = await createSupabaseServerClient();
  const storia = await leggiConversazione(conversazioneId);

  await supabase
    .from('chat_messages')
    .insert({ conversazione_id: conversazioneId, ruolo: 'utente', testo: pulita });

  const messaggi: MessaggioModello[] = [
    { role: 'system', content: await istruzioni() },
    ...storia
      .slice(-MEMORIA)
      .map((m): MessaggioModello =>
        m.ruolo === 'utente'
          ? { role: 'user', content: m.testo }
          : { role: 'assistant', content: m.testo },
      ),
    { role: 'user', content: pulita },
  ];

  const eseguiti: StrumentoEseguito[] = [];
  const proposte: PropostaSalvata[] = [];
  const grafici: Grafico[] = [];
  let costo: number | null = null;
  let testo: string | null = null;
  let token: number | null = null;

  for (let giro = 0; giro < GIRI_MASSIMI; giro += 1) {
    const risposta = await conversaConModello({ messaggi, strumenti: STRUMENTI });

    if (risposta.costo !== null) costo = (costo ?? 0) + risposta.costo;
    if (risposta.token !== null) token = (token ?? 0) + risposta.token;

    if (risposta.chiamate.length === 0) {
      testo = risposta.testo;
      break;
    }

    messaggi.push({
      role: 'assistant',
      content: risposta.testo,
      tool_calls: risposta.chiamate,
    });

    for (const chiamata of risposta.chiamate) {
      const esito = await eseguiChiamata(chiamata);
      eseguiti.push({ nome: chiamata.function.name, argomenti: esito.argomenti, dati: esito.dati });
      if (esito.proposta !== undefined) {
        proposte.push({ ...esito.proposta, applicata_at: null });
      }
      if (esito.grafico !== undefined) grafici.push(esito.grafico);
      messaggi.push({ role: 'tool', tool_call_id: chiamata.id, content: esito.serializzato });
    }

    // All'ultimo giro concesso il modello ha appena ricevuto dei risultati e non
    // avrà occasione di usarli. Si chiude con una chiamata senza strumenti,
    // così scrive la risposta invece di lasciare la domanda in sospeso.
    if (giro === GIRI_MASSIMI - 1) {
      const finale = await conversaConModello({ messaggi, strumenti: [] });
      if (finale.costo !== null) costo = (costo ?? 0) + finale.costo;
      if (finale.token !== null) token = (token ?? 0) + finale.token;
      testo = finale.testo;
    }
  }

  if (testo === null || testo.trim() === '') {
    testo =
      'Non sono riuscito a completare la risposta. Prova a chiedere una cosa per volta, ' +
      'o guarda i numeri dal cruscotto.';
  }

  // Il controllo gira sui dati di **questo** turno e su quelli dei turni
  // precedenti: una cifra già mostrata all'utente ieri può essere ripetuta oggi
  // senza che sia inventata.
  const disponibili = [eseguiti.map((e) => e.dati), storia.map((m) => m.strumenti)];
  const inventate = cifreInventate(testo, disponibili);

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversazione_id: conversazioneId,
      ruolo: 'copilota',
      testo,
      strumenti: eseguiti.length === 0 ? null : eseguiti,
      proposte: proposte.length === 0 ? null : proposte,
      grafici: grafici.length === 0 ? null : grafici,
      cifre_inventate: inventate.length === 0 ? null : inventate,
      model: modelloInUso(),
      tokens_used: token,
    })
    .select('id, ruolo, testo, strumenti, proposte, grafici, cifre_inventate, created_at')
    .single<MessaggioSalvato>();

  if (error !== null || data === null) {
    throw new Error(`Salvataggio del messaggio fallito: ${error?.message ?? 'nessuna riga'}`);
  }

  return { conversazioneId, messaggio: data, costo };
}

type EsitoChiamata = {
  argomenti: unknown;
  dati: unknown;
  proposta?: Proposta;
  grafico?: Grafico;
  serializzato: string;
};

/**
 * Esegue una chiamata e ne prepara il risultato per il modello.
 *
 * Un errore diventa il **risultato** dell'operazione, non un'eccezione: se il
 * modello ha scritto una data nel formato sbagliato deve poterlo leggere e
 * riprovare. Far fallire il giro intero costringerebbe l'utente a riformulare
 * una domanda che era giusta.
 */
async function eseguiChiamata(chiamata: ChiamataStrumento): Promise<EsitoChiamata> {
  let argomenti: Record<string, unknown> = {};
  try {
    const letti: unknown = JSON.parse(chiamata.function.arguments);
    if (letti !== null && typeof letti === 'object' && !Array.isArray(letti)) {
      argomenti = letti as Record<string, unknown>;
    }
  } catch {
    // Argomenti illeggibili: si prosegue con nessuno, e lo strumento dirà cosa
    // gli mancava.
  }

  const s = strumento(chiamata.function.name);
  if (s === undefined) {
    const dati = { errore: `Operazione sconosciuta: ${chiamata.function.name}` };
    return { argomenti, dati, serializzato: JSON.stringify(dati) };
  }

  try {
    const esito = await s.esegui(argomenti);
    return {
      argomenti,
      dati: esito.dati,
      serializzato: tronca(JSON.stringify(esito.dati)),
      ...(esito.proposta === undefined ? {} : { proposta: esito.proposta }),
      ...(esito.grafico === undefined ? {} : { grafico: esito.grafico }),
    };
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    if (!(errore instanceof ArgomentoNonValido)) {
      console.error(`[copilota] ${chiamata.function.name} fallita:`, messaggio);
    }
    const dati = { errore: messaggio };
    return { argomenti, dati, serializzato: JSON.stringify(dati) };
  }
}

/**
 * Tronca un risultato troppo lungo dicendolo.
 *
 * Tagliare in silenzio farebbe rispondere «sono tutti» a un modello che ne ha
 * visti la metà, ed è il tipo di errore che non si nota mai.
 */
function tronca(serializzato: string): string {
  if (serializzato.length <= LIMITE_RISULTATO) return serializzato;
  return (
    serializzato.slice(0, LIMITE_RISULTATO) +
    '\n\n[RISULTATO TRONCATO: è più lungo di quanto tu possa ricevere. ' +
    'Non trattarlo come completo — richiedi un periodo più corto o un limite più basso.]'
  );
}

// ---------------------------------------------------------------------------
// Applicare una proposta
// ---------------------------------------------------------------------------
// La proposta si rilegge **dal database** invece di accettarla dal client. Non
// è sfiducia nel browser — è l'unico utente dell'applicazione — ma
// corrispondenza: ciò che l'utente ha letto e ciò che viene eseguito devono
// essere lo stesso oggetto. Accettando gli argomenti dalla richiesta, la frase
// mostrata e l'operazione svolta sarebbero due cose che *dovrebbero* combaciare,
// e prima o poi non combacerebbero.

export class PropostaNonTrovata extends Error {}

export async function applicaProposta(messaggioId: string, indice: number): Promise<Proposta> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('chat_messages')
    .select('id, proposte')
    .eq('id', messaggioId)
    .maybeSingle<{ id: string; proposte: PropostaSalvata[] | null }>();

  const proposte = data?.proposte ?? [];
  const proposta = proposte[indice];
  if (proposta === undefined) throw new PropostaNonTrovata('Questa proposta non esiste più.');
  if (proposta.applicata_at !== null) {
    throw new PropostaNonTrovata('Questa proposta è già stata applicata.');
  }

  await esegui(proposta);

  // Si marca dopo. Se la scrittura fallisse, la proposta deve restare
  // applicabile: un bottone che si spegne senza aver fatto niente è peggio di
  // un errore.
  const aggiornate = proposte.map((p, i) =>
    i === indice ? { ...p, applicata_at: new Date().toISOString() } : p,
  );
  await supabase.from('chat_messages').update({ proposte: aggiornate }).eq('id', messaggioId);

  return proposta;
}

/**
 * Le scritture passano dalle stesse funzioni che usano le schermate.
 *
 * Nessuna scrive su `transactions` o `merchants` da qui: `correggiMovimento`
 * marca `manually_categorized`, `aggiornaMerchant` rilancia la
 * categorizzazione. Riscrivere quei passaggi qui vorrebbe dire avere due
 * percorsi di scrittura leggermente diversi, e il secondo dimenticherebbe
 * proprio il pezzo che non si vede.
 */
async function esegui(proposta: Proposta): Promise<void> {
  const a = proposta.argomenti;

  switch (proposta.operazione) {
    case 'correggi_movimento':
      // `confermaMovimento` è la stessa funzione che usa la conferma di fine
      // giornata: con dei campi valorizzati passa a `correggi_movimento` e
      // marca `manually_categorized`. Il ramo «va bene così» non è
      // raggiungibile da qui, perché lo strumento rifiuta una proposta che non
      // cambia niente.
      await confermaMovimento({
        id: String(a['id']),
        discrezionalita: (a['discrezionalita'] as Discretion | null) ?? null,
        contesto: (a['contesto'] as Context | null) ?? null,
        note: (a['note'] as string | null) ?? null,
      });
      return;

    case 'aggiorna_esercente': {
      const supabase = await createSupabaseServerClient();
      // Si leggono i valori attuali perché `aggiornaMerchant` scrive tutti e
      // quattro i campi: passando `null` a quelli non toccati li cancellerebbe.
      const { data } = await supabase
        .from('merchants')
        .select('id, category_id, discretion, context, is_subscription')
        .eq('id', String(a['id']))
        .maybeSingle<{
          id: string;
          category_id: string | null;
          discretion: Discretion | null;
          context: Context | null;
          is_subscription: boolean;
        }>();

      if (data === null) throw new PropostaNonTrovata("L'esercente non esiste più.");

      await aggiornaMerchant({
        id: data.id,
        category_id: (a['categoria_id'] as string | null) ?? data.category_id,
        discretion: (a['discrezionalita'] as Discretion | null) ?? data.discretion,
        context: (a['contesto'] as Context | null) ?? data.context,
        is_subscription:
          typeof a['abbonamento'] === 'boolean' ? a['abbonamento'] : data.is_subscription,
      });
      return;
    }

    case 'crea_categoria': {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.rpc('crea_categoria', {
        p_nome: String(a['nome']),
        p_padre_id: (a['padre_id'] as string | null) ?? null,
        p_discrezionalita: (a['discrezionalita_predefinita'] as string | null) ?? null,
      });
      if (error !== null) throw new Error(error.message);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------------------

export async function leggiConversazione(id: string): Promise<readonly MessaggioSalvato[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('chat_messages')
    .select('id, ruolo, testo, strumenti, proposte, grafici, cifre_inventate, created_at')
    .eq('conversazione_id', id)
    .order('created_at')
    .limit(200);
  return comeArray<MessaggioSalvato>(data);
}

export type RigaConversazione = {
  conversazione_id: string;
  iniziata_at: string;
  ultima_at: string;
  messaggi: number;
  titolo: string | null;
};

export async function leggiConversazioni(): Promise<readonly RigaConversazione[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_conversazioni')
    .select('*')
    .order('ultima_at', { ascending: false })
    .limit(20);
  return comeArray<RigaConversazione>(data);
}
