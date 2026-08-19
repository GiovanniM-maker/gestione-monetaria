import type { Metadata } from 'next';
import { leggiAbbonamenti, leggiRiepilogo } from '@/lib/abbonamenti/rileva';
import { PannelloAbbonamenti } from './pannello-abbonamenti';
import {
  formattaEuro,
  fuoriDalTotale,
  ordinaPerPeso,
  totalePerTipo,
} from '@/lib/abbonamenti/formato';
import { leggiClassi } from '@/lib/tassonomia/classi';
import { tinteDelleClassi } from '../grafici';
import { TestataPagina } from '../testata';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Abbonamenti' };

/**
 * La schermata della Fase 5.
 *
 * In cima non c'e' l'elenco degli abbonamenti: c'e' **il numero**. Costo
 * ricorrente mensile per classe di discrezionalita' e' la sola metrica per cui
 * questa applicazione esiste, e tutto il resto della pagina serve a poterle
 * credere — quali abbonamenti la compongono, e cosa e' rimasto fuori.
 *
 * Subito sotto la metrica c'e' cosa esclude e perche'. Una cifra che scarta
 * righe senza dire quante ne scarta non e' verificabile, ed e' esattamente il
 * genere di numero che si smette di guardare dopo la prima sorpresa.
 */
export default async function AbbonamentiPage() {
  const [abbonamenti, riepilogo, classi] = await Promise.all([
    leggiAbbonamenti(),
    leggiRiepilogo(),
    leggiClassi(),
  ]);

  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

  // I due tassi si sommano **solo qui**, per aprire la schermata con una cifra
  // sola. Sotto restano separati, e la nota lo dice: rispondono a due azioni
  // diverse, e un totale unico nasconderebbe quale delle due e' possibile.
  const voci = ordinaPerPeso(riepilogo.metrica);
  const abbonamentiMese = totalePerTipo(voci, 'abbonamento');
  const abitudiniMese = totalePerTipo(voci, 'abitudine');
  const fuori = fuoriDalTotale(voci);

  return (
    <div className="space-y-6">
      <TestataPagina
        illustrazione="/illustrazioni/abbonamenti.webp"
        titolo="Costo ricorrente"
        cifra={formattaEuro(abbonamentiMese + abitudiniMese)}
        etichetta="al mese, fra abbonamenti e abitudini"
        figure={[
          { valore: formattaEuro(abbonamentiMese), etichetta: 'si disdicono' },
          { valore: formattaEuro(abitudiniMese), etichetta: 'si cambiano' },
          ...(fuori.costoMensile === 0n
            ? []
            : [{ valore: formattaEuro(fuori.costoMensile), etichetta: 'fuori dal totale' }]),
        ]}
        perche={
          <p>
            Quanto costa al mese ciò che si ripete, diviso per classe di discrezionalità. In due
            numeri e non in uno: gli <strong>abbonamenti</strong> si disdicono — è un gesto, il
            risparmio è certo — le <strong>abitudini</strong> si cambiano, e cambiare un’abitudine
            non è un gesto. Sommarli nasconderebbe quale delle due azioni è possibile, ed è per
            questo che la somma qui sopra è un’apertura e non la metrica: la metrica sono i due
            numeri separati.
          </p>
        }
      />

      <PannelloAbbonamenti
        abbonamenti={abbonamenti}
        metrica={riepilogo.metrica}
        escluse={riepilogo.escluse}
        nellaMetrica={riepilogo.nellaMetrica}
        totali={riepilogo.totali}
        oggi={oggi}
        tinte={tinteDelleClassi(classi)}
      />
    </div>
  );
}
