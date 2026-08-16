import { ScheletroPagina } from '@/app/(app)/scheletri';

/**
 * Cosa si vede fra il tocco e l'arrivo della schermata.
 *
 * Senza questo file Next tiene a schermo la pagina **vecchia** per tutto il
 * tempo del viaggio fino al server: il tocco sembra non aver funzionato e si
 * tocca di nuovo. Con questo file la transizione e' immediata.
 *
 * C'e' un secondo effetto, meno ovvio e forse piu' grosso: `<Link>` puo'
 * **precaricare** questo confine anche per una pagina dinamica, quindi la
 * struttura e' gia' nel browser prima ancora del tocco.
 */
export default function Caricamento() {
  return <ScheletroPagina />;
}
