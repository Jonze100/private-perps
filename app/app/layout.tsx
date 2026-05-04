import type { Metadata } from 'next';
import './globals.css';
import WalletProvider from '@/components/WalletProvider';

export const metadata: Metadata = {
  title: 'PrivatePerps — MPC-encrypted perpetuals',
  description: 'Privacy-preserving perpetuals trading powered by Arcium MPC on Solana',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning prevents wallet adapter SSR mismatch */}
      <body suppressHydrationWarning className="min-h-screen bg-[#080b11] text-white antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
