import { ScheletroPagina } from '@/app/(app)/scheletri';

/**
 * Vedi `movimenti/loading.tsx`: senza questo file Next tiene a schermo la
 * pagina **vecchia** per tutto il viaggio fino al server, e il tocco sembra non
 * aver funzionato.
 */
export default function Caricamento() {
  return <ScheletroPagina />;
}
