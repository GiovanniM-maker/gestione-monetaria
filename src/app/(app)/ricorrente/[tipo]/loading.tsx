import { ScheletroPagina } from '@/app/(app)/scheletri';

/**
 * Vedi `dove/loading.tsx`: senza questo confine Next tiene a schermo la
 * pagina vecchia per tutto il viaggio, e il tocco sembra non aver funzionato.
 * Con il confine la transizione e' immediata, e `<Link>` puo' precaricarlo.
 */
export default function Caricamento() {
  return <ScheletroPagina />;
}
