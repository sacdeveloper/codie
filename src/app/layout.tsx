import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Medical Reporting", template: "%s · Medical Reporting" },
  description: "Medical examination reporting with passport OCR, A4 PDF generation and QR verification.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
