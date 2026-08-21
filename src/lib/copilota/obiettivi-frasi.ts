/**
 * Le frasi con cui si legge un obiettivo.
 *
 * Un modulo **suo**, e non in fondo a `obiettivi.ts`, per una ragione che il
 * build ha trovato prima di me: quello ha `import 'server-only'`, e queste due
 * funzioni servono anche alla schermata, che e' un componente client. Un
 * modulo puro le rende leggibili da tutte e due le parti senza indebolire
 * niente — `server-only` continua a proteggere cio' che tocca il database.
 *
 * Stanno insieme perche' rispondono alla stessa domanda: **come si dice a una
 * persona.** Erano scritte in tre posti — la schermata, il prompt del copilota
 * e la descrizione della proposta — e tre copie divergono: qui divergere
 * significa approvare una proposta che dice una cosa e ritrovarne scritta
 * un'altra nell'elenco.
 */

/**
 * L'obiettivo in una frase, come lo leggerebbe una persona.
 *
 * In un posto solo perche' era in **tre**: la schermata, il prompt del
 * copilota e la descrizione della proposta lo scrivevano ognuno a modo suo. Tre
 * copie della stessa frase divergono, e qui divergere ha una conseguenza
 * precisa: l'utente approva una proposta che dice una cosa e ne ritrova
 * scritta un'altra nell'elenco.
 *
 * `RigaObiettivo` non basta come tipo, di proposito: la accetta anche
 * `strumenti.ts`, che lavora su una proiezione con meno campi. Chiedere qui
 * solo quelli che servono lascia entrambe le forme senza doverle convertire.
 */
export function descriviObiettivo(o: {
  tipo: string;
  valore: string | null;
  categoria: string | null;
  classe_nome: string | null;
}): string {
  const dove = o.categoria ?? o.classe_nome;
  const quanto = o.valore === null ? '—' : `${o.valore} €`;
  const in_ = dove === null ? '' : ` in ${dove}`;

  if (o.tipo === 'liquidita_minima') return `Tenere almeno ${quanto} sul conto`;
  if (o.tipo === 'risparmiare') return `Mettere da parte ${quanto}`;
  if (o.tipo === 'ridurre') return `Spendere meno${in_}`;
  return `Non più di ${quanto} al mese${in_}`;
}

/**
 * Quanto manca alla scadenza, a parole.
 *
 * I due versi si dicono in modo diverso: «scaduto da» e' un fatto compiuto,
 * «scade fra» e' un avviso. Confonderli renderebbe indistinguibile una cosa da
 * rinnovare da una che sta per esserlo — che e' l'unica informazione per cui
 * questa riga esiste.
 */
export function descriviScadenza(o: {
  giorni_alla_scadenza: number;
  valido_fino_a: string;
}): string {
  const g = o.giorni_alla_scadenza;
  if (g < 0) return `scaduto da ${-g} ${-g === 1 ? 'giorno' : 'giorni'}`;
  if (g === 0) return 'scade oggi';
  if (g === 1) return 'scade domani';
  if (g <= 30) return `scade fra ${g} giorni`;
  return `vale fino al ${o.valido_fino_a}`;
}
