import { Icona, type NomeIcona } from './icone';

/**
 * La tessera di classe: il quadrato colorato che precede una riga.
 *
 * ---------------------------------------------------------------------------
 * L'icona e' di vetro, il colore e' un dato
 * ---------------------------------------------------------------------------
 * Dentro c'e' l'icona 3D generata per la classe — il cuore rosa, la valigetta
 * ambra — ognuna nel vetro del **suo** colore, mai una tinta di comodo: il
 * colore della classe dice che tipo di spesa e', ed e' la stessa informazione
 * dei pallini e della barra segmentata.
 *
 * ---------------------------------------------------------------------------
 * Fallisce chiusa, su una velatura
 * ---------------------------------------------------------------------------
 * L'insieme dei file esistenti sta scritto QUI, e rispecchia
 * `public/illustrazioni/classi/`. Una classe creata ieri sera da `/classi` non
 * ci sta ancora: la sua tessera resta la velatura sfumata della sua tinta —
 * un quadrato del colore giusto, non un'immagine rotta ne' l'icona di
 * qualcun'altra. Quando la sua icona verra' generata, si aggiunge il file e
 * il nome qui sotto.
 */

const ICONE_DI_VETRO: ReadonlySet<string> = new Set([
  'voluttuario',
  'utile',
  'essenziale',
  'investimento',
  'non-classificato',
]);

/** «non classificato» arriva anche con lo spazio: e' la stessa tessera. */
function nomeFile(slug: string): string | null {
  const chiave = slug.trim().toLowerCase().replace(/\s+/g, '-');
  return ICONE_DI_VETRO.has(chiave) ? chiave : null;
}

/**
 * La tessera di una categoria: velatura della classe, glifo a tratto.
 *
 * Diversa da quella di classe di proposito, ed e' una gerarchia che si vede
 * senza saperla nominare: le CLASSI hanno l'icona di vetro piena — sono
 * quattro, sono l'identita' dell'app — le CATEGORIE hanno il tratto sulla
 * velatura, perche' sono trentaquattro e un muro di caramelle 3D non fa
 * trovare niente.
 *
 * La tinta e' quella della discrezionalita' predefinita della categoria
 * (docs/aspetto.md §3.4): il colore continua a dire l'unica cosa che dice in
 * questa applicazione. `icona` nulla — una categoria appena creata, o la
 * migration 0049 non ancora applicata — lascia la velatura vuota: colorata e
 * senza glifo, che e' vero.
 */
export function TesseraCategoria({
  icona,
  tinta,
  misura = 38,
}: {
  icona: NomeIcona | null;
  tinta: string;
  misura?: number;
}) {
  return (
    <span
      className="tessera"
      // `color` e non un colore sull'icona: il glifo eredita da `currentColor`,
      // quindi la tinta sta in un posto solo anche dentro la tessera.
      style={{ width: misura, height: misura, color: tinta, ['--tinta' as string]: tinta }}
    >
      {icona !== null && <Icona nome={icona} misura={Math.round(misura * 0.5)} spessore={1.9} />}
    </span>
  );
}

/**
 * L'avatar di un esercente: l'iniziale sulla velatura della sua classe.
 *
 * Deterministico e locale (docs/aspetto.md §3.5): niente favicon, niente
 * servizi di loghi — manderebbero i nomi degli esercenti a un terzo a ogni
 * apertura, e la ragione della regola 8 non cambia col destinatario. E
 * l'applicazione si apre in metropolitana: un avatar che a volte c'e' e a
 * volte no fa sembrare rotta una lista che e' perfetta. Stesso esercente,
 * stesso avatar, anche offline.
 */
export function Avatar({
  nome,
  tinta,
  misura = 34,
}: {
  nome: string | null;
  tinta: string;
  misura?: number;
}) {
  // La prima LETTERA o cifra, non il primo carattere: «(senza esercente)»
  // mostrava una parentesi, che non e' un'iniziale — e' un refuso col vestito
  // buono. Se un nome non ha niente di leggibile, un punto neutro.
  const iniziale = ((nome ?? '').match(/\p{L}|\p{N}/u)?.[0] ?? '·').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="avatar"
      style={{ width: misura, height: misura, ['--tinta' as string]: tinta }}
    >
      {iniziale}
    </span>
  );
}

export function Tessera({
  slug,
  tinta,
  misura = 38,
}: {
  /** Lo slug della classe, o `null` per il non classificato. */
  slug: string | null;
  /** Il colore della classe, dalla mappa di `tinteDelleClassi`. */
  tinta: string;
  misura?: number;
}) {
  const file = nomeFile(slug ?? 'non-classificato');
  return (
    <span
      className="tessera"
      style={{ width: misura, height: misura, ['--tinta' as string]: tinta }}
    >
      {file !== null && (
        <img
          src={`/illustrazioni/classi/${file}.webp`}
          alt=""
          width={Math.round(misura * 0.68)}
          height={Math.round(misura * 0.68)}
          loading="lazy"
        />
      )}
    </span>
  );
}
