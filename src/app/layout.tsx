// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
// Import the new provider
import { ReactiveMidnightWalletProvider } from "@/context/ReactiveMidnightWalletContext";
import { Navbar } from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Midnight Reactive Starter",
  description: "Reactive setup for Midnight DApp connection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, backgroundColor: '#111827', color: '#d1d5db' }}>
        <ReactiveMidnightWalletProvider>
          <Navbar />
          <main style={{ padding: '1rem 2rem' }}>
            {children}
          </main>
        </ReactiveMidnightWalletProvider>
      </body>
    </html>
  );
}