import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "./components/Navigation";
import SeedInitializer from "./components/SeedInitializer";
import RolloverInitializer from "./components/RolloverInitializer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aragón Hábitos",
  description: "Plataforma de seguimiento de hábitos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Aragón Hábitos",
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: "#1e40af",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SeedInitializer />
        <RolloverInitializer />
        <Navigation />
        {children}
      </body>
    </html>
  );
}
