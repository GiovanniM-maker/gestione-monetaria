/**
 * Come si chiama un movimento, quando un esercente non ce l'ha.
 *
 * ---------------------------------------------------------------------------
 * Il problema che risolve
 * ---------------------------------------------------------------------------
 * Un bonifico a un privato non ha un esercente — la Fase 4 non lo abbina di
 * proposito — e la lista mostrava la causale della banca: «Inviato da
 * Revolut», «Sent from Revolut». Undici volte la stessa frase, che dice il
 * canale e non il destinatario: per capire a chi sono andati 360 € bisognava
 * aprire la scheda e scavare nei campi grezzi.
 *
 * Il nome c'e' sempre stato: e' la controparte (`counterparty_raw` — il
 * creditore su un'uscita, il debitore su un'entrata). Questa funzione la
 * preferisce alla causale, e sta in un posto solo perche' cinque copie della
 * stessa preferenza divergono alla prima schermata nuova.
 *
 * ---------------------------------------------------------------------------
 * Non e' una questione di regola 8
 * ---------------------------------------------------------------------------
 * La regola 8 vieta i nomi delle controparti verso un LLM. Queste etichette
 * vanno al browser dell'utente, che i suoi bonifici li ha fatti: nascondergli
 * a chi ha mandato i soldi non protegge nessuno — gli impedisce di
 * classificarli.
 */

function pulito(valore: string | null | undefined): string | null {
  if (typeof valore !== 'string') return null;
  const v = valore.trim();
  return v === '' ? null : v;
}

export function etichettaMovimento(m: {
  esercente?: string | null;
  counterparty_raw?: string | null;
  raw_description?: string | null;
}): string {
  return (
    pulito(m.esercente) ??
    pulito(m.counterparty_raw) ??
    pulito(m.raw_description) ??
    '(senza descrizione)'
  );
}
