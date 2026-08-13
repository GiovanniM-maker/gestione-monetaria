/**
 * Un renderer minimo per il testo del report.
 *
 * Non c'e' una libreria di markdown, e non perche' sia difficile installarla:
 * il vincolo dello stack dice di non aggiungere librerie oltre alle
 * strettamente necessarie, e per tre costrutti — un titoletto, un elenco, un
 * paragrafo — una dipendenza intera sarebbe sproporzionata. Il modello riceve
 * l'istruzione di usare solo questi tre.
 *
 * Fallisce nel verso giusto: cio' che non riconosce resta un paragrafo di
 * testo. Una riga che non si sa disegnare si legge lo stesso, mentre un
 * renderer severo la farebbe sparire — e in un report una frase sparita non si
 * nota.
 */

export type Blocco =
  | { tipo: 'titolo'; testo: string }
  | { tipo: 'elenco'; voci: readonly string[] }
  | { tipo: 'paragrafo'; testo: string };

export function analizza(contenuto: string): readonly Blocco[] {
  const blocchi: Blocco[] = [];
  let elenco: string[] = [];
  let paragrafo: string[] = [];

  const chiudiElenco = () => {
    if (elenco.length > 0) {
      blocchi.push({ tipo: 'elenco', voci: elenco });
      elenco = [];
    }
  };
  const chiudiParagrafo = () => {
    if (paragrafo.length > 0) {
      blocchi.push({ tipo: 'paragrafo', testo: paragrafo.join(' ') });
      paragrafo = [];
    }
  };

  for (const riga of contenuto.replace(/\r\n/g, '\n').split('\n')) {
    const pulita = riga.trim();

    if (pulita === '') {
      chiudiElenco();
      chiudiParagrafo();
      continue;
    }

    const titolo = /^#{1,4}\s+(.*)$/.exec(pulita);
    if (titolo !== null) {
      chiudiElenco();
      chiudiParagrafo();
      blocchi.push({ tipo: 'titolo', testo: titolo[1] ?? '' });
      continue;
    }

    const voce = /^[-*]\s+(.*)$/.exec(pulita);
    if (voce !== null) {
      chiudiParagrafo();
      elenco.push(voce[1] ?? '');
      continue;
    }

    chiudiElenco();
    paragrafo.push(pulita);
  }

  chiudiElenco();
  chiudiParagrafo();
  return blocchi;
}

export type Pezzo = { testo: string; forte: boolean };

/**
 * Spezza il grassetto `**cosi'**.
 *
 * Serve perche' il modello lo usa per gli importi, ed e' esattamente dove
 * l'occhio deve cadere. Gli asterischi spaiati restano testo invece di
 * mangiarsi il resto della frase.
 */
export function pezzi(testo: string): readonly Pezzo[] {
  const risultato: Pezzo[] = [];
  const parti = testo.split(/\*\*/);

  for (const [indice, parte] of parti.entries()) {
    if (parte === '') continue;
    // Con un numero dispari di delimitatori l'ultimo e' spaiato: quel pezzo
    // torna normale invece di restare in grassetto fino a fine paragrafo.
    const forte = indice % 2 === 1 && indice < parti.length - 1;
    risultato.push({ testo: parte, forte });
  }

  return risultato;
}
