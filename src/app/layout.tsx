import type { Metadata } from "next";
import { IBM_Plex_Mono, Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Compounders",
  description:
    "Track the daily, weekly, and monthly routines you want to compound with streaks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
