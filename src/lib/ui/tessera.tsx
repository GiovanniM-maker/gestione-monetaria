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
