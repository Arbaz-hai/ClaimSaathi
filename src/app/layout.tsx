import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClaimSaathi — Speak your language. Move your claim forward.',
  description:
    'A multilingual, multi-agent health insurance claims assistant. Evidence-backed next best actions for Indian patients and families. Prototype with fictional data and simulated insurer responses.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
