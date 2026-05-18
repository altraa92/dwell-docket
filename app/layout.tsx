import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DwellDocket - GenLayer Deposit Case Console",
  description:
    "A GenLayer StudioNet console for shortlet deposit case intake, evidence submission, AI validator verdicts, and appeals.",
  keywords: [
    "rental dispute",
    "deposit",
    "blockchain",
    "AI arbitration",
    "GenLayer",
    "onchain justice",
  ],
  authors: [{ name: "DwellDocket Labs" }],
  openGraph: {
    title: "DwellDocket",
    description:
      "A StudioNet case console for shortlet deposit disputes on GenLayer.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DwellDocket",
    description:
      "Shortlet deposit case intake, verdicts, and appeals on GenLayer StudioNet.",
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
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#081213" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#081213" }}>
        {children}
      </body>
    </html>
  );
}
