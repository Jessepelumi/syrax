import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Syrax Intake",
  description: "Secure file requests delivered directly to a selected Google Drive folder.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
