import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { comeArray } from '@/lib/enablebanking/redact';
import { chiaveNome } from './persone';

/**
 * Gli esercenti che i **dati** garantiscono essere esercenti.
 *
 * ---------------------------------------------------------------------------
 * Perché serve, e perché non è un allentamento della regola 8
 * ---------------------------------------------------------------------------
 * Il filtro della Fase 4 ha due termini: `soloCarta || sembraAttivita`. Il
 * secondo è un'inferenza sulla forma del nome, e sbaglia spesso in senso
 * prudente — `Bella Napoli` non ha né forma societaria né cifre né dominio né
 * una parola di mestiere, quindi non passa. Il primo non è un'inferenza affatto: **con la
 * carta si paga in un negozio, non a un amico**, e se ogni movimento di quel
 * nome è un pagamento con carta, dall'altra parte c'è un esercente per
 * costruzione.
 *
 * Quel primo termine si era perso a valle. `sanificaMetriche` lavora sugli
 * aggregati, dove il metodo di pagamento non c'è, quindi vedeva solo il nome —
 * e il copilot rispondeva «un privato» su cinque ristoranti su sei, rendendo
 * impossibile la domanda «dove ho speso 179 €?».
 *
 * Questo modulo restituisce l'evidenza mancante, senza toccare la regola:
 * l'insieme dei nomi per cui la garanzia vale davvero, letto da
 * `v_esercenti_da_carta`. Un esercente con anche un solo movimento che non sia
 * un pagamento con carta — o con un `bank_code` nullo, o senza movimenti — non
 * è nell'insieme. Fallisce chiuso.
 */

export async function esercentiDaCarta(): Promise<ReadonlySet<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('v_esercenti_da_carta')
    .select('esercente')
    .eq('solo_carta', true);

  // Un errore di lettura non deve trasformarsi in un permesso: senza
  // l'evidenza si torna al solo `sembraAttivita`, che trattiene di più. È il
  // verso giusto in cui fallire.
  if (error !== null) {
    console.error('[regola 8] garanzia della carta non leggibile:', error.message);
    return new Set();
  }

  return new Set(
    comeArray<{ esercente: string | null }>(data)
      .map((r) => r.esercente)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
      .map(chiaveNome),
  );
}
