import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { inCache } from '@/lib/supabase/cache';
import { comeArray } from '@/lib/enablebanking/redact';
import { COLORI_CLASSE, type DiscretionClassRow } from '@/lib/db/types';
import { messaggioUtente } from '@/lib/db/messaggio';

/**
 * Le classi di discrezionalita': leggerle, crearle, correggerle, eliminarle.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste questo modulo invece di quattro `onClick`
 * ---------------------------------------------------------------------------
 * La regola della Fase 0: ogni operazione dev'essere raggiungibile dal copilot,
 * non solo da un bottone. Una funzione con una firma esplicita e' uno strumento
 * che un modello sa usare; un gestore di click, per lui, non esiste.
 *
 * Il conto e' gia' stato pagato una volta: delle undici operazioni esposte in
 * Fase 10, dieci esistevano gia' e una sola era da scrivere. Qui vale identico —
 * la UI chiama queste, e il copilota chiamera' le stesse.
 *
 * ---------------------------------------------------------------------------
 * La validazione vera sta nel database
 * ---------------------------------------------------------------------------
 * Qui si controlla quel poco che si puo' controllare senza una query — un nome
 * vuoto, un colore fuori tavolozza — e il resto lo dicono la foreign key e
 * `valida_classe`. Riscrivere qui le regole della `0043` significherebbe due
 * copie della stessa regola, e due copie divergono: e' esattamente il difetto
 * che questa fase e' venuta a togliere, non uno da reintrodurre un piano piu'
 * in alto.
 */

export class ClasseNonValida extends Error {}

/**
 * Tutte le classi, archiviate comprese, nell'ordine dichiarato.
 *
 * Le archiviate arrivano lo stesso: sparire da un **selettore** e sparire da un
 * **totale** sono due cose diverse, e chi mostra una spesa classificata l'anno
 * scorso con una classe che oggi non si usa piu' ha comunque bisogno del suo
 * nome e del suo colore. A nasconderle nei selettori ci pensa `perSceglierne`.
 */
export const leggiClassi = cache(
  inCache('classi', async (sb): Promise<readonly DiscretionClassRow[]> => {
    const { data } = await sb
      .from('discretion_classes')
      .select('slug, nome, descrizione, colore, sort_order, nel_ricorrente, is_archived')
      .order('sort_order', { ascending: true });
    return comeArray<DiscretionClassRow>(data);
  }),
);

/** Quelle che si possono ancora scegliere. */
export function perSceglierne(
  classi: readonly DiscretionClassRow[],
): readonly DiscretionClassRow[] {
  return classi.filter((c) => !c.is_archived);
}

/**
 * Dallo slug al nome mostrato.
 *
 * Uno slug che non ha una riga non e' un errore da nascondere: e' la
 * pseudo-classe «non classificato», che nei dati e' un `null` e nelle viste
 * arriva gia' con quel nome. Restituirlo com'e' e' la cosa giusta — inventargli
 * un nome vuoto farebbe sparire una riga che vale dei soldi.
 */
export function nomeClasse(classi: readonly DiscretionClassRow[], slug: string): string {
  return classi.find((c) => c.slug === slug)?.nome ?? slug;
}

/* -------------------------------------------------------------------------- */
/* Le scritture                                                                */
/* -------------------------------------------------------------------------- */

export type NuovaClasse = {
  nome: string;
  descrizione?: string | null;
  colore?: string | null;
  nelRicorrente?: boolean;
};

/**
 * Crea una classe e restituisce il suo slug.
 *
 * Rieseguibile, come `crea_categoria`: lo stesso nome restituisce quella che
 * c'e' gia'. Un tocco ripetuto su un telefono non deve produrre due
 * «Risparmio».
 */
export async function creaClasse(n: NuovaClasse): Promise<string> {
  const nome = typeof n.nome === 'string' ? n.nome.trim() : '';
  if (nome === '') throw new ClasseNonValida('Il nome della classe non può essere vuoto.');

  const colore = n.colore ?? null;
  if (colore !== null && !COLORI_CLASSE.includes(colore as (typeof COLORI_CLASSE)[number])) {
    throw new ClasseNonValida(`Colore non ammesso: ${colore}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('crea_classe', {
    p_nome: nome,
    p_descrizione: n.descrizione ?? null,
    p_colore: colore,
    p_nel_ricorrente: n.nelRicorrente ?? true,
  });

  if (error !== null)
    throw new ClasseNonValida(
      messaggioUtente(error, 'Non e’ stato possibile salvare questa classe.'),
    );
  return String(data);
}

export type CorrezioneClasse = {
  slug: string;
  nome?: string | null;
  descrizione?: string | null;
  colore?: string | null;
  ordine?: number | null;
  nelRicorrente?: boolean | null;
  archiviata?: boolean | null;
};

/**
 * Corregge una classe. «Nullo = non cambiare», come `aggiornaCategoria`.
 *
 * Lo slug non cambia mai da qui: e' l'identita'. Rinominare «Voluttuario» in
 * «Sfizi» cambia il nome mostrato e non riscrive una sola riga di
 * `transactions` — ed e' precisamente il motivo per cui il nome e lo slug sono
 * due colonne.
 */
export async function aggiornaClasse(c: CorrezioneClasse): Promise<void> {
  if (typeof c.slug !== 'string' || c.slug.trim() === '') {
    throw new ClasseNonValida('Classe non indicata.');
  }

  const nome = typeof c.nome === 'string' ? c.nome.trim() : null;
  if (nome !== null && nome === '') {
    throw new ClasseNonValida('Il nome non può essere vuoto.');
  }

  const colore = c.colore ?? null;
  if (colore !== null && !COLORI_CLASSE.includes(colore as (typeof COLORI_CLASSE)[number])) {
    throw new ClasseNonValida(`Colore non ammesso: ${colore}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('aggiorna_classe', {
    p_slug: c.slug,
    p_nome: nome,
    p_descrizione: c.descrizione ?? null,
    p_colore: colore,
    p_ordine: c.ordine ?? null,
    p_nel_ricorrente: c.nelRicorrente ?? null,
    p_archiviata: c.archiviata ?? null,
  });

  if (error !== null)
    throw new ClasseNonValida(
      messaggioUtente(error, 'Non e’ stato possibile salvare questa classe.'),
    );
}

export type EsitoEliminazione = {
  eliminata: string;
  spostate_in: string | null;
  movimenti: number;
  esercenti: number;
  categorie: number;
};

/**
 * Elimina una classe, spostando le sue righe dove indicato.
 *
 * Se la classe e' in uso, `verso` non e' facoltativo: senza destinazione
 * l'unica alternativa sarebbe mettere le righe a `null`, cioe' spostare
 * silenziosamente della spesa classificata dentro «non classificato». Chi
 * sposta dei soldi da una classe all'altra deve nominare l'altra.
 *
 * E' anche il modo di **unire** due classi: non serve un'operazione in piu'.
 *
 * Lo spostamento tocca anche le righe con `manually_categorized`. Non c'e'
 * alternativa onesta — la classe che avevano non esiste piu' — ma e' un atto
 * esplicito, e l'esito dice quante righe ha spostato.
 */
export async function eliminaClasse(
  slug: string,
  verso: string | null = null,
): Promise<EsitoEliminazione> {
  if (typeof slug !== 'string' || slug.trim() === '') {
    throw new ClasseNonValida('Classe non indicata.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('elimina_classe', {
    p_slug: slug,
    p_verso: verso,
  });

  if (error !== null)
    throw new ClasseNonValida(
      messaggioUtente(error, 'Non e’ stato possibile salvare questa classe.'),
    );
  return data as EsitoEliminazione;
}
