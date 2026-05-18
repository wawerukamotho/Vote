import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VotingApp Devnet",
  description: "A Solana devnet interface for the Anchor voting program.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
