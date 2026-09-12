import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: { default: "WHO WOULD?", template: "%s · WHO WOULD?" },
  description: "Your friends vote. The room decides.",
  manifest: "/manifest.webmanifest",
  applicationName: "WHO WOULD?",
  appleWebApp: { capable: true, title: "WHO WOULD?", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "WHO WOULD?",
    description: "Your friends vote. The room decides.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#09090b",
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
        {children}
      </body>
    </html>
  );
}
