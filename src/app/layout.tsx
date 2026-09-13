import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { NetworkStatus } from "@/components/network-status";

export const metadata: Metadata = {
  metadataBase: new URL("https://most-likely-azure.vercel.app"),
  title: { default: "WHO WOULD?", template: "%s · WHO WOULD?" },
  description: "A realtime party game where your friends vote secretly and the room decides.",
  manifest: "/manifest.webmanifest",
  applicationName: "WHO WOULD?",
  appleWebApp: { capable: true, title: "WHO WOULD?", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  keywords: ["party game", "multiplayer game", "who would", "most likely to", "friends game"],
  openGraph: {
    title: "WHO WOULD?",
    description: "Your friends vote. The room decides.",
    type: "website",
    siteName: "WHO WOULD?"
  },
  twitter: {
    card: "summary",
    title: "WHO WOULD?",
    description: "Your friends vote. The room decides."
  }
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="ambient ambient-one" aria-hidden="true" />
        <div className="ambient ambient-two" aria-hidden="true" />
        <PwaRegister />
        <NetworkStatus />
        {children}
      </body>
    </html>
  );
}
