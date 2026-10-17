import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis | Metatility",
  description: "Genesis operating platform by Metatility",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
