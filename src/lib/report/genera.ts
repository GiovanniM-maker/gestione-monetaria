import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { chiediAlModello, modelloInUso } from '@/lib/ai/modello';
import { sanificaMetriche } from './sanifica';

/**
 * Il report mensile.
 *
 * ---------------------------------------------------------------------------
 * Il modello non calcola nemmeno una cifra
 * ---------------------------------------------------------------------------
 * Tutti i numeri arrivano da `metriche_report()`, in SQL. Al modello resta la
 * narrazione. Non e' prudenza generica: in Fase 4, su cento proposte, ha
 * ragionato dall'importo quando il nome non bastava — «importo alto suggerisce
 * spesa casa» — e ha inventato una motivazione plausibile pur di averne una.
 * Un modello che *scrive* numeri li sbaglia allo stesso modo, e in un report li
 * sbaglia in modo credibile, che e' peggio perche' nessuno li ricontrolla.
 *
 * Le istruzioni glielo dicono, ma le istruzioni non bastano: la difesa vera e'
 * che non ha i dati per calcolare niente — riceve aggregati finiti, non righe.
 */

const SISTEMA = `Sei l'analista di un'applicazione personale di spese. Scrivi in italiano,
rivolgendoti direttamente a chi legge, con il "tu".

REGOLE ASSOLUTE:
1. NON calcolare, stimare o dedurre nessun numero. Usa ESCLUSIVAMENTE le cifre presenti nei dati
   che ricevi, copiate esattamente come sono. Se una cifra non c'è, non nominarla: di' che non è
   disponibile.
2. NON sommare, sottrarre, dividere o convertire. Nemmeno percentuali: se una percentuale non è
   nei dati, non scriverla.
3. Dove compare "un privato" al posto di un nome, lascialo così: è una controparte che non va
   nominata.
4. Non inventare spiegazioni. Se non sai perché una spesa è salita, scrivi che è salita e basta.
   Una causa plausibile ma inventata è peggio di nessuna causa.
5. Chiama il numero con il suo nome. "spesa_tipica" è una MEDIANA — un mese realmente osservato — e
   chiamarla "media" rende falsa una frase che contiene un numero giusto. Scrivi "il mese tipico" o
   "il valore mediano", mai "la media".

COSA SCRIVERE, in quest'ordine e senza titoli generici:
- Una frase sola su com'è andato il mese, confrontata con il tipico dei mesi precedenti.
- Il costo ricorrente: abbonamenti e abitudini restano SEPARATI e non si sommano mai, perché
  suggeriscono due azioni diverse — un abbonamento si disdice, un'abitudine si cambia.
- Cosa è cambiato davvero rispetto al solito: le due o tre voci che saltano all'occhio.
- Cosa richiede una decisione, se ci sono avvisi aperti.
- Se ci sono movimenti senza categoria o senza cambio, dillo: sono la parte che il report non sa.

FORMA: massimo 300 parole. Usa "## " per due o tre titoletti, "- " per gli elenchi, "**" per
mettere in risalto gli importi. Niente tabelle, niente preamboli, niente conclusioni motivazionali.`;

export type EsitoReport = {
  id: string;
  mese: string;
  contenuto: string;
  modello: string;
  costo: number | null;
  anonimizzati: number;
};

/** Il primo giorno del mese precedente, nel fuso applicativo. */
export function mesePrecedente(): string {
  const oggi = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }));
  return `${new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7)}-01`;
}

export async function generaReport(primoDelMese: string): Promise<EsitoReport> {
  const supabase = await createSupabaseServerClient();

  const { data: metricheGrezze, error } = await supabase.rpc('metriche_report', {
    p_mese: primoDelMese,
  });
  if (error !== null) throw new Error(`Metriche non calcolabili: ${error.message}`);

  // La regola 8 gira **prima** della chiamata. Dopo, il dato e' uscito.
  const { metriche, anonimizzati } = sanificaMetriche(metricheGrezze);

  const risposta = await chiediAlModello({
    system: SISTEMA,
    prompt:
      'Ecco i dati del mese. Ogni importo è in euro, negativo = uscita.\n\n' +
      JSON.stringify(metriche, null, 2),
    maxTokens: 1200,
  });

  const periodo = (metriche as { periodo?: { inizio?: string; fine?: string } }).periodo ?? {};

  const { data, error: erroreScrittura } = await supabase
    .from('reports')
    .upsert(
      {
        period_type: 'monthly',
        period_start: periodo.inizio ?? primoDelMese,
        period_end: periodo.fine ?? primoDelMese,
        // Si salva la versione **sanificata**: è quella che il modello ha
        // davvero visto, e un audit che confrontasse la narrazione con dati
        // diversi da quelli usati non proverebbe niente.
        metrics: metriche,
        content_md: risposta.testo,
        model: modelloInUso(),
        tokens_used: risposta.token ?? null,
      },
      { onConflict: 'period_type,period_start' },
    )
    .select('id')
    .single<{ id: string }>();

  if (erroreScrittura !== null || data === null) {
    throw new Error(`Salvataggio report fallito: ${erroreScrittura?.message ?? 'nessuna riga'}`);
  }

  return {
    id: data.id,
    mese: periodo.inizio ?? primoDelMese,
    contenuto: risposta.testo,
    modello: modelloInUso(),
    costo: risposta.costo,
    anonimizzati,
  };
}

export type RigaReport = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  content_md: string | null;
  model: string | null;
  tokens_used: number | null;
  created_at: string;
  metrics: unknown;
};

export async function leggiReport(): Promise<readonly RigaReport[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('reports')
    .select('id, period_type, period_start, period_end, content_md, model, tokens_used, created_at')
    .order('period_start', { ascending: false })
    .limit(24);
  return comeArray<RigaReport>(data);
}

export async function leggiUnReport(id: string): Promise<RigaReport | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('reports').select('*').eq('id', id).maybeSingle();
  return (data as RigaReport | null) ?? null;
}
