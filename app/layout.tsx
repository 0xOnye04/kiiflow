import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KiiFlow",
  description: "A clean fintech Web3 frontend for swap, transfer, lock, and earn workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
