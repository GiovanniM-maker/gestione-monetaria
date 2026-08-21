import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { aiConfigurata, chiediAlModello } from '@/lib/ai/modello';

/**
 * Il titolo generato di una conversazione.
 *
 * ---------------------------------------------------------------------------
 * Perche' questo file contiene una cosa sola
 * ---------------------------------------------------------------------------
 * Il ciclo di vita delle conversazioni — la stella, il rinomina, la scadenza a
 * trenta giorni, la pulizia — vive in `conversazione.ts` e nella migration
 * `0051_conversazioni_salvate`, ed e' arrivato da un'altra parte mentre questo
 * ramo lavorava. Qui resta solo cio' che quel disegno non aveva: **il titolo
 * scritto dal modello**.
 *
 * La riga in `chat_conversations` nasce **pigra**, alla prima stella o al primo
 * rinomina. Il titolo generato e' il terzo motivo per cui puo' nascere, e non
 * cambia quella regola: una conversazione senza riga e' semplicemente non
 * salvata e col titolo del primo messaggio.
 *
 * ---------------------------------------------------------------------------
 * Il titolo lo scrive il modello, e non viola il principio server-derived
 * ---------------------------------------------------------------------------
 * «La descrizione la scrive il server» esiste perche' la descrizione di
 * un'**azione** deve corrispondere all'azione eseguita: il modo di fallire e'
 * *approvi una cosa e ne succede un'altra*. Il titolo di una conversazione non
 * descrive nessun oggetto strutturato, e il modo di fallire e' *un titolo un
 * po' storto*. Non e' la stessa categoria di rischio.
 *
 * Si genera **una volta**, dopo il secondo scambio, e poi si congela: un titolo
 * che si riscrive a ogni messaggio rende l'elenco illeggibile, perche' quello
 * che si cercava ieri oggi si chiama in un altro modo.
 */

const ISTRUZIONI_TITOLO =
  'Scrivi un titolo per questa conversazione: da due a cinque parole, in italiano, ' +
  'senza virgolette, senza punto finale, senza preamboli. Deve dire di COSA si parla, ' +
  'non ripetere la domanda. Rispondi solo col titolo.';

/**
 * Genera il titolo, una volta sola, quando la conversazione ha abbastanza da
 * dire.
 *
 * Fallisce **in silenzio**: senza titolo `v_conversazioni` ripiega sulla prima
 * domanda dell'utente, che e' una risposta accettabile. Far fallire una
 * risposta del copilota perche' non si e' riusciti a dargli un'etichetta
 * sarebbe il rapporto sbagliato fra le due cose.
 *
 * Riceve **solo il testo delle domande dell'utente**: non e' un canale verso
 * cui far uscire dati bancari, e quelle frasi le ha scritte l'utente stesso.
 */
export async function generaTitoloSeManca(
  id: string,
  domandeUtente: readonly string[],
): Promise<void> {
  if (domandeUtente.length < 2 || !aiConfigurata()) return;

  const supabase = await createSupabaseServerClient();
  const { data: riga } = await supabase
    .from('chat_conversations')
    .select('titolo')
    .eq('id', id)
    .maybeSingle<{ titolo: string | null }>();

  // Congelato: se un titolo c'e' gia' — generato ieri o scritto a mano — non se
  // ne scrive un altro. `riga === null` invece significa che la riga pigra non
  // e' ancora nata, ed e' il caso normale: si procede.
  if (riga !== null && riga.titolo !== null) return;

  try {
    const risposta = await chiediAlModello({
      system: ISTRUZIONI_TITOLO,
      prompt: domandeUtente.slice(0, 4).join('\n'),
      maxTokens: 24,
    });

    const titolo = risposta.testo
      .trim()
      .replace(/^["«»']|["«»'.]$/g, '')
      .slice(0, 120);
    if (titolo === '') return;

    // `upsert` come `salvaConversazione` e `rinominaConversazione`: e' la
    // stessa riga pigra, e crearla in un modo diverso vorrebbe dire due
    // percorsi verso la stessa tabella.
    await supabase.from('chat_conversations').upsert({ id, titolo }, { onConflict: 'id' });
  } catch (errore) {
    console.error('[copilota] titolo non generato:', errore);
  }
}
