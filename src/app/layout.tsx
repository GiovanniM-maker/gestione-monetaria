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
    <html lang="it">
      {/* Il tema, prima del primo pixel.
          Sincrono e nell'`<head>` di proposito: qualunque cosa arrivi dopo il
          disegno produce un lampo bianco all'apertura, che su un telefono al
          buio e' la cosa piu' fastidiosa che l'applicazione possa fare. Lo
          script sta in `lib/ui/tema.ts`, accanto alle funzioni di cui e' la
          seconda scrittura. */}
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      {/* `overflow-x-hidden`: una tabella o un nome lunghissimo non devono poter
          far scorrere lateralmente l'intera pagina. Su desktop si nota appena,
          sul telefono rende l'applicazione inutilizzabile. */}
      <body className="min-h-dvh overflow-x-hidden">{children}</body>
    </html>
  );
}
