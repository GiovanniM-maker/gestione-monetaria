/**
 * Come si chiama un movimento, quando lo si guarda.
 *
 * Puro, e in un posto solo perche' era in **cinque**: la lista, la scheda, la
 * fisarmonica di «Dove» e due punti di «Da confermare» scrivevano tutti
 * `esercente ?? raw_description`, e tutti e cinque sbagliavano allo stesso modo.
 *
 * ---------------------------------------------------------------------------
 * La causale della banca dice **come**, non **a chi**
 * ---------------------------------------------------------------------------
 * Su un invio P2P Revolut scrive `Sent from Revolut` — o `Inviato da Revolut` —
 * su ogni singola riga: sull'affitto, sulla farmacia, sui trenta euro a un
 * amico. E' la stessa identica frase per movimenti che non hanno niente in
 * comune, quindi come nome non distingue niente: un elenco di dieci righe
 * chiamate tutte allo stesso modo non e' un elenco.
 *
 * Il destinatario c'e' e sta in `counterparty_raw`. Era solo nascosto sotto
 * «Come l'ha mandato la banca», che nasce chiuso perche' e' diagnostica — e per
 * queste righe era invece l'unica informazione che rispondesse a «cos'e'
 * questo».
 *
 * ---------------------------------------------------------------------------
 * L'ordine, e perche' la controparte viene prima della causale
 * ---------------------------------------------------------------------------
 * 1. **l'esercente**, quando c'e': e' il nome normalizzato, quello che si
 *    ritrova uguale su tutte le sue spese;
 * 2. **la controparte**, che e' un fatto sul movimento — chi ha preso i soldi;
 * 3. **la causale**, che spesso e' cio' che la banca aveva da dire su se stessa.
 *
 * Dove la causale gia' bastava non cambia niente: su un pagamento con carta
 * senza esercente le due sono la stessa stringa.
 *
 * Regola 8: qui possono comparire nomi di persona, ed e' corretto — questa
 * funzione compone cio' che si legge sullo schermo dell'utente. Il confine da
 * non passare e' quello con l'LLM, e li' i nomi passano da `sanificaMetriche`,
 * che non chiama mai questa.
 */
export function etichettaMovimento(m: {
  esercente?: string | null;
  counterparty_raw?: string | null;
  raw_description?: string | null;
}): string {
  return (
    pieno(m.esercente) ??
    pieno(m.counterparty_raw) ??
    pieno(m.raw_description) ??
    '(senza descrizione)'
  );
}

/** Una stringa vuota non e' un nome: e' un campo che c'e' e non dice niente. */
function pieno(valore: string | null | undefined): string | null {
  if (typeof valore !== 'string') return null;
  const p = valore.trim();
  return p === '' ? null : p;
}
