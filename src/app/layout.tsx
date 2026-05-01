import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Aurum Wealth',
  description: 'Wealth Management Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        {/* Sunday v2 Animated Background Blobs */}
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: -1 }}>
          <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(147,197,253,0.15) 0%, transparent 70%)', animation: 'drift1 20s ease-in-out infinite alternate', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', top: '20%', right: '-15%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(134,239,172,0.12) 0%, transparent 70%)', animation: 'drift2 25s ease-in-out infinite alternate', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: '-20%', left: '10%', width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(253,164,175,0.12) 0%, transparent 70%)', animation: 'drift3 22s ease-in-out infinite alternate', borderRadius: '50%' }} />
        </div>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
