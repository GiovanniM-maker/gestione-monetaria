import type { Metadata, Viewport } from 'next';
import './globals.css';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      {/* `overflow-x-hidden`: una tabella o un nome lunghissimo non devono poter
          far scorrere lateralmente l'intera pagina. Su desktop si nota appena,
          sul telefono rende l'applicazione inutilizzabile. */}
      <body className="min-h-dvh overflow-x-hidden">{children}</body>
    </html>
  );
}
