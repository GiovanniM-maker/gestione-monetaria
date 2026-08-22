import type { KeyboardEvent } from 'react';

/**
 * L'Invio conferma il campo.
 *
 * ---------------------------------------------------------------------------
 * Perche' serve, misurato
 * ---------------------------------------------------------------------------
 * I fogli che creano qualcosa — una categoria, una classe — non sono dentro un
 * `<form>`: sono pannelli, e il salvataggio passa da `fetch`. Conseguenza che
 * si vede solo provandola: si scrive «Pizzeria», si preme **Invio** sulla
 * tastiera, e non succede niente. Verificato nel foglio «Nuova categoria» — con
 * un nome valido, l'unica chiamata partita era la sincronizzazione di fondo.
 *
 * Su un telefono pesa piu' che su una scrivania: la tastiera copre il fondo del
 * pannello, il tasto di conferma sta **sotto il pollice**, e il bottone «Crea»
 * puo' essere proprio dietro i tasti. E' attrito in un flusso costruito apposta
 * per toglierlo — il «+ Nuova categoria» esiste perche' fermarsi a uscire e
 * tornare era il passaggio che si voleva evitare.
 *
 * ---------------------------------------------------------------------------
 * `isComposing`, e perche' non e' pedanteria
 * ---------------------------------------------------------------------------
 * Con una tastiera a composizione — giapponese, cinese, coreana, ma anche i
 * suggerimenti di alcune tastiere mobili — **l'Invio chiude la composizione**,
 * non conferma il modulo. Senza questo controllo, scrivere accentate con una
 * tastiera che compone salverebbe a meta' parola. Il campo lo dichiara da solo:
 * si legge, non si indovina.
 */
export function allInvio(
  azione: () => void,
  abilitato = true,
): (e: KeyboardEvent<HTMLInputElement>) => void {
  return (e) => {
    if (e.key !== 'Enter') return;
    // `nativeEvent` e' un `KeyboardEvent` del DOM: `isComposing` sta li'.
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing === true) return;
    e.preventDefault();
    if (abilitato) azione();
  };
}
