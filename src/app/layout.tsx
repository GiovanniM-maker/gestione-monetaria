import type { Metadata, Viewport } from 'next';
import './globals.css';
import { COLORE_BARRA, SCRIPT_TEMA } from '@/lib/ui/tema';

export const metadata: Metadata = {
  title: 'Gestione monetaria',
  description: 'Analisi delle spese personali',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Aggiunta alla schermata iniziale su iOS: si apre senza la barra di Safari.
  // E' il motivo per cui il manifest esiste — questa applicazione si guarda dal
  // telefono, non da una scrivania.
  appleWebApp: { capable: true, title: 'Monetaria', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // `viewport-fit=cover` piu' le variabili `env(safe-area-inset-*)` nel layout:
  // senza, su un telefono con la tacca l'intestazione finisce sotto l'orologio
  // e la barra inferiore mangia l'ultima riga.
  viewportFit: 'cover',
  /**
   * Quando sale la tastiera, il contenuto si rimpicciolisce.
   *
   * Il foglio e' `max-height: 85dvh` dentro un `<dialog>`, e mentre e' aperto il
   * corpo e' **fissato**: su iOS la tastiera ridimensiona solo il visual
   * viewport, quindi gli elementi fissi restano dove sono e il bottone «Salva»
   * finisce sotto i tasti. Su Chromium senza questa riga non si rimpicciolisce
   * nemmeno il layout viewport, e `dvh` da solo non basta.
   *
   * `resizes-content` e non `overlays-content`: qui la tastiera compare sopra
   * moduli corti dentro un pannello: e' meglio che il pannello si accorci
   * piuttosto che l'azione sparisca.
   */
  interactiveWidget: 'resizes-content',
  // Il valore di partenza, per la primissima richiesta e per il caso in cui lo
  // script del tema non giri. Da li' in poi lo riscrive `SeguiTema`, perche'
  // una scelta manuale non puo' essere espressa da un `media`.
  themeColor: COLORE_BARRA.chiaro,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `suppressHydrationWarning` **solo** su `<html>`, e per una ragione
       precisa: lo script qui sotto scrive `data-tema` e `color-scheme` sul
       nodo radice prima che React arrivi, quindi l'HTML del server e quello
       del client differiscono per costruzione. E' l'unico nodo in cui questo
       e' voluto. Non si propaga ai figli — React lo applica al solo elemento
       su cui e' scritto — quindi non nasconde nessun altro disallineamento. */
    <html lang="it" suppressHydrationWarning>
      {/* Il tema, prima del primo pixel.
          Sincrono e dentro un `<head>` **esplicito**: qualunque cosa arrivi
          dopo il disegno produce un lampo bianco all'apertura, che su un
          telefono al buio e' la cosa piu' fastidiosa che l'applicazione possa
          fare.

          Il `<head>` non e' decorazione. Stava come figlio diretto di `<html>`,
          che in HTML non e' una posizione valida: il parser del browser lo
          sposta dentro `<head>` mentre legge, quindi l'albero del client non e'
          piu' quello che il server ha scritto e l'idratazione fallisce. React
          19 lo diceva su **ogni pagina**, tre volte — «Cannot render a sync or
          defer <script> outside the main document», «<script> cannot be a child
          of <html>», «A tree hydrated but some attributes … didn't match».

          `async` lo farebbe tacere e romperebbe il motivo per cui esiste: uno
          script asincrono gira dopo il primo disegno, cioe' dopo il lampo.
          Il `<head>` esplicito e' l'unica forma che tiene insieme le due cose.

          Lo script sta in `lib/ui/tema.ts`, accanto alle funzioni di cui e' la
          seconda scrittura. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      {/* `overflow-x-hidden`: una tabella o un nome lunghissimo non devono poter
          far scorrere lateralmente l'intera pagina. Su desktop si nota appena,
          sul telefono rende l'applicazione inutilizzabile. */}
      <body className="min-h-dvh overflow-x-hidden">{children}</body>
    </html>
  );
}
