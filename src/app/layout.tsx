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
    "The simplest habit tracker that works. No signup, no cloud. Just you and your streaks.",
  openGraph: {
    title: "Compounders — Track What Compounds",
    description:
      "The simplest habit tracker that works. No signup, no cloud. Just you and your streaks.",
    type: "website",
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
      </head>
      <body className="min-h-full font-sans text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
