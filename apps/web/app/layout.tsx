import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'BookSaga', template: '%s · BookSaga' },
  description: 'Turn one idea into a complete, KDP-ready book series.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1023',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster theme="dark" position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
