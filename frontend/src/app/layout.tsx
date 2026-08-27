import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "WorkSphere AI - Gen AI Lab Management System",
  description: "Advanced management dashboard for NCAI Gen AI Research Lab.",
};

import AlertsWidget from "../components/AlertsWidget";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-theme-bg text-theme-fg font-sans flex flex-col selection:bg-purple-500 selection:text-white transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <AlertsWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
