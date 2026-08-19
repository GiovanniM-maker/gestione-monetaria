import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { aiConfigurata, chiediAlModello } from '@/lib/ai/modello';

/**
 * Le conversazioni come oggetti, non come `conversazione_id` ripetuto.
 *
 * ---------------------------------------------------------------------------
 * Il confine che queste funzioni devono tenere vero
 * ---------------------------------------------------------------------------
 * **Una chat non contiene mai niente di duraturo.** Contiene le tracce di come
 * una cosa duratura e' nata. Quindi `elimina` porta via i messaggi e le
 * proposte mai applicate, e **non tocca** le correzioni gia' applicate — che
 * vivono su `transactions` — ne' gli obiettivi.
 *
 * E' verificabile, ed e' il test che conta: se cancellando una conversazione
 * smettesse di funzionare qualcos'altro, il confine sarebbe disegnato male.
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

export type RigaConversazioneCompleta = {
  conversazione_id: string;
  iniziata_at: string;
  ultima_at: string;
  messaggi: number;
  titolo: string | null;
  salvata: boolean;
  scade_at: string | null;
  titolo_manuale: boolean;
};

export async function leggiConversazioniComplete(): Promise<readonly RigaConversazioneCompleta[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('v_conversazioni')
    .select('*')
    .order('ultima_at', { ascending: false })
    .limit(100);
  return comeArray<RigaConversazioneCompleta>(data);
}

/** La stella. `false` rimette una scadenza a trenta giorni da adesso. */
export async function conservaConversazione(id: string, salvata = true): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('conserva_conversazione', {
    p_id: id,
    p_salvata: salvata,
  });
  if (error !== null) throw new Error(`Salvataggio della conversazione fallito: ${error.message}`);
  return data === true;
}

/** Il titolo scritto a mano: da qui in poi nessun automatismo lo tocca. */
export async function rinominaConversazione(id: string, titolo: string): Promise<boolean> {
  const pulito = titolo.trim().slice(0, 120);
  if (pulito === '') throw new Error('Il titolo è vuoto.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('titola_conversazione', {
    p_id: id,
    p_titolo: pulito,
    p_manuale: true,
  });
  if (error !== null) throw new Error(`Rinomina fallita: ${error.message}`);
  return data === true;
}

/**
 * Cancella una conversazione: i messaggi, e la riga.
 *
 * Non tocca nient'altro, e non e' una svista: cio' che e' nato qui e ha valore
 * — una correzione applicata, un obiettivo — e' stato **copiato fuori** nel
 * momento in cui e' stato applicato, e vive per conto suo.
 */
export async function eliminaConversazione(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error: e1 } = await supabase.from('chat_messages').delete().eq('conversazione_id', id);
  if (e1 !== null) throw new Error(`Cancellazione dei messaggi fallita: ${e1.message}`);

  const { error: e2 } = await supabase.from('chat_conversations').delete().eq('id', id);
  if (e2 !== null) throw new Error(`Cancellazione della conversazione fallita: ${e2.message}`);
}

/** La spazzata delle scadute. La chiama la sequenza quotidiana. */
export async function pulisciConversazioniScadute(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('pulisci_conversazioni_scadute');
  if (error !== null) throw new Error(`Pulizia delle conversazioni fallita: ${error.message}`);
  return typeof data === 'number' ? data : 0;
}

const ISTRUZIONI_TITOLO =
  'Scrivi un titolo per questa conversazione: da due a cinque parole, in italiano, ' +
  'senza virgolette, senza punto finale, senza preamboli. Deve dire di COSA si parla, ' +
  'non ripetere la domanda. Rispondi solo col titolo.';

/**
 * Genera il titolo, una volta sola, quando la conversazione ha abbastanza da
 * dire.
 *
 * Fallisce **in silenzio**: senza titolo `v_conversazioni` ripiega sulla prima
 * domanda troncata, che e' una risposta accettabile. Far fallire una risposta
 * del copilota perche' non si e' riusciti a dargli un'etichetta sarebbe il
 * rapporto sbagliato fra le due cose.
 *
 * Riceve **solo il testo dei messaggi dell'utente**: non e' un canale verso cui
 * far uscire dati bancari, e le domande le ha scritte l'utente stesso.
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

  // Congelato: c'e' gia' un titolo, non se ne scrive un altro.
  if (riga === null || riga.titolo !== null) return;

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

    // `p_manuale: false`, quindi la funzione SQL rifiuta da sola se nel
    // frattempo l'utente ne ha scritto uno a mano.
    await supabase.rpc('titola_conversazione', {
      p_id: id,
      p_titolo: titolo,
      p_manuale: false,
    });
  } catch (errore) {
    console.error('[copilota] titolo non generato:', errore);
  }
}
