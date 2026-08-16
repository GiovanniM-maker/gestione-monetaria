/**
 * L'apertura di una schermata.
 *
 * ---------------------------------------------------------------------------
 * Perche' esiste
 * ---------------------------------------------------------------------------
 * Il cruscotto si apriva con una **scheda che risponde**: un numero grande, cosa
 * misura, e da cosa e' fatto. Tutte le altre schermate si aprivano con un
 * titolo e un paragrafo di prosa — «Ogni assegnazione crea un alias, non una
 * correzione su una riga…» — e la differenza non era di gusto: la prima dice
 * subito **a che punto sei**, la seconda spiega come funziona una cosa che stai
 * gia' facendo.
 *
 * Alla decima apertura quella spiegazione e' un ostacolo, ed e' lo stesso
 * ragionamento per cui la prosa metodologica del cruscotto e' finita sotto un
 * «perche'?». Qui il patto e' identico: **il numero sopra, la spiegazione sotto
 * a scomparsa**.
 *
 * ---------------------------------------------------------------------------
 * Ogni schermata ha un numero, e non e' un abbellimento
 * ---------------------------------------------------------------------------
 * «33 categorie», «13 etichette per 2.028 €», «3 avvisi da leggere»: sono le
 * risposte alla domanda che fa aprire quella schermata. Dove un numero non
 * esiste non si inventa — `cifra` non e' obbligatoria, e senza di lei la
 * testata resta il solo titolo, che e' onesto.
 *
 * E' un componente server: nessun byte di JavaScript per un'intestazione.
 */

export type FiguraSecondaria = { valore: string; etichetta: string };

export function TestataPagina({
  titolo,
  cifra,
  etichetta,
  tinta,
  figure,
  perche,
  azioni,
}: {
  titolo: string;
  /** Il numero grande. Una stringa gia' formattata, o niente. */
  cifra?: string | null;
  /** Cosa misura la cifra. Senza, un numero grande e' un enigma. */
  etichetta?: string | null;
  /** Tinge appena la scheda, come sul cruscotto. Un colore della tavolozza. */
  tinta?: string | null;
  /** Altre due o tre misure, piccole, in riga. */
  figure?: readonly FiguraSecondaria[];
  /** La prosa che prima stava in cima. Finisce sotto un «perche'?». */
  perche?: React.ReactNode;
  azioni?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div
        className="scheda space-y-1 p-5"
        style={
          tinta === null || tinta === undefined
            ? undefined
            : {
                backgroundImage: `radial-gradient(24rem 12rem at 8% 0%, color-mix(in oklab, ${tinta} 22%, transparent), transparent 70%)`,
              }
        }
      >
        <h1 className="text-[22px] font-bold tracking-[-0.03em]">{titolo}</h1>

        {cifra !== null && cifra !== undefined && (
          <p className="numerone pt-1 text-[34px]">{cifra}</p>
        )}
        {etichetta !== null && etichetta !== undefined && (
          <p className="text-[13px] text-testo-3">{etichetta}</p>
        )}

        {figure !== undefined && figure.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 pt-3">
            {figure.map((f) => (
              <div key={f.etichetta}>
                <dd className="cifra text-[17px] font-semibold">{f.valore}</dd>
                <dt className="text-[12px] text-testo-3">{f.etichetta}</dt>
              </div>
            ))}
          </dl>
        )}
      </div>

      {azioni !== undefined && <div className="flex flex-wrap gap-2">{azioni}</div>}

      {perche !== undefined && (
        <details className="text-[13px] text-testo-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-testo-3">
            perch&eacute; funziona cos&igrave;?
          </summary>
          <div className="pb-2">{perche}</div>
        </details>
      )}
    </div>
  );
}

/**
 * Un conteggio come cifra: «33», «1.297».
 *
 * Costruito a mano e non con `Intl.NumberFormat`, per la stessa ragione di
 * `formattaEuro`: in italiano il raggruppamento predefinito **salta i numeri
 * di quattro cifre**, quindi 1297 restava «1297» accanto a importi scritti
 * «1.297,00 €». Due modi di scrivere lo stesso migliaio nella stessa schermata
 * sono un dettaglio, ma e' il tipo di dettaglio che si vede.
 *
 * Mai per un importo: quelli passano dai centesimi e da `formattaEuro`.
 */
export function conta(n: number): string {
  const segno = n < 0 ? '-' : '';
  return (
    segno +
    Math.abs(Math.trunc(n))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  );
}
