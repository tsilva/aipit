import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const SITE_TITLE = "The AI Pit | AI Persona Debate Simulator";
const SITE_DESCRIPTION = "Create AI persona simulations and watch them debate against each other in moderator-led discussions. Powered by OpenRouter models. Interactive AI debate platform for exploring different perspectives.";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: [],
    shortcut: [],
    apple: [],
  },
  keywords: [
    "AI debate",
    "persona simulation",
    "AI personas",
    "OpenRouter",
    "AI chat",
    "language models",
    "AI discussion",
    "moderated debate",
    "AI conversation",
    "interactive AI",
    "LLM debate",
    "AI simulation",
  ],
  authors: [{ name: "Tiago Silva" }],
  creator: "Tiago Silva",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: "Watch AI personas debate against each other in moderated discussions. Create custom personas and explore different perspectives with OpenRouter-powered models.",
    type: "website",
    url: SITE_URL,
    siteName: "The AI Pit",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "Create AI personas and watch them debate. Interactive simulation powered by OpenRouter models.",
    creator: "@tiagosilva",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "The AI Pit",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  author: {
    "@type": "Person",
    name: "Tiago Silva",
    url: "https://www.tsilva.eu",
  },
  applicationCategory: "AIApplication",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${displayFont.variable} ${monoFont.variable} antialiased`}>{children}</body>
    </html>
  );
}
