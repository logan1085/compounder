import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Compounders — Track What Compounds",
  description:
    "The simplest habit tracker that works. No signup, no cloud, no data harvesting. Just you and your streaks. Join 1,000+ people building better habits.",
  metadataBase: new URL("https://compounders.vercel.app"),
  openGraph: {
    title: "Compounders — Track What Compounds",
    description:
      "The simplest habit tracker that works. No signup, no cloud. Just you and your streaks.",
    url: "https://compounders.vercel.app",
    siteName: "Compounders",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compounders — Track What Compounds",
    description:
      "The simplest habit tracker that works. No signup, no cloud. Just you and your streaks.",
  },
  applicationName: "Compounders",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Compounders",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1b2a3a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full font-sans text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
