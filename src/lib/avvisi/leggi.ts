import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';

/**
 * Gli avvisi.
 *
 * Il rilevamento non e' qui: e' in `genera_alert()`. Questo modulo legge e
 * cambia stato, e le due scritture sono operazioni nominate perche' il copilot
 * della Fase 10 dovra' poterle chiamare («ignora questo avviso»).
 */

export type RigaAvviso = {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  read_at: string | null;
  related_transaction_id: string | null;
  related_subscription_id: string | null;
  related_category_id: string | null;
  merchant_id: string | null;
  peso: number;
};

/**
 * I due tipi che il cruscotto mostra gia' come riga di stato.
 *
 * Restano avvisi a tutti gli effetti — con la loro storia e la possibilita' di
 * ignorarli — ma non vanno ripetuti in cima al cruscotto accanto al riquadro
 * che dice la stessa cosa. Un avviso doppio non e' due volte piu' visibile:
 * e' meta' credibile.
 */
export const GIA_SUL_CRUSCOTTO = ['session_expiring', 'sync_failed'];

export async function leggiAvvisi(soloNuovi = false): Promise<readonly RigaAvviso[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('v_avvisi')
    .select('*')
    .order('peso', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100);

  if (soloNuovi) query = query.eq('status', 'new');
  const { data } = await query;
  return comeArray<RigaAvviso>(data);
}

/** Quanti avvisi aspettano di essere letti. Serve al conteggio in navigazione. */
export async function quantiAvvisi(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');
  return count ?? 0;
}

export class AvvisoNonValido extends Error {}

const STATI = ['read', 'dismissed', 'actioned'];

export async function cambiaStatoAvviso(id: string, stato: string): Promise<void> {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new AvvisoNonValido('Avviso non indicato.');
  }
  if (!STATI.includes(stato)) {
    throw new AvvisoNonValido(`Stato non ammesso: ${stato}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('alerts')
    .update({ status: stato, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) throw new Error(`Aggiornamento avviso fallito: ${error.message}`);
}

/** Ricalcola gli avvisi. Rieseguibile: `dedupe_key` impedisce le copie. */
export async function generaAvvisi(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('genera_alert');
  if (error !== null) throw new Error(`Generazione avvisi fallita: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Il ciclo di vita di un avviso, in due numeri.
 *
 * Nell'**Inbox** della home un avviso sta al massimo sette giorni: dopo, o e'
 * stato gestito o non lo sara' — e un invito che resta li' per settimane
 * insegna a non leggere gli inviti. Resta pero' consultabile nello **storico**
 * (`/avvisi`) per novanta giorni, poi la pulizia notturna lo elimina: uno
 * storico senza fine non e' uno storico, e' un archivio che nessuno apre.
 */
export const GIORNI_IN_INBOX = 7;
export const GIORNI_DI_STORICO = 90;

/**
 * Elimina gli avvisi piu' vecchi dello storico. Gira nella sequenza quotidiana.
 *
 * Qualunque sia lo stato, `new` compreso: un avviso di novanta giorni fa mai
 * letto non e' un avviso in attesa, e' un fatto vecchio — e la `dedupe_key`
 * contiene il valore che l'ha scatenato, quindi se la condizione e' ancora
 * vera l'avviso rinasce alla generazione successiva, nuovo davvero.
 */
export async function pulisciAvvisi(adesso: number = Date.now()): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const limite = new Date(adesso - GIORNI_DI_STORICO * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('alerts')
    .delete()
    .lt('created_at', limite)
    .select('id');
  if (error !== null) throw new Error(`Pulizia avvisi fallita: ${error.message}`);
  return comeArray<{ id: string }>(data).length;
}
