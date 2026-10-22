import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fleuron Industries — Gestion Dépôt",
  description: "Gestion partagée des stocks, tournées, clients, installateurs et SAV Fleuron Industries.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
