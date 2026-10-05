import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis | Metatility",
  description: "AI Marketing Operating System by Metatility",
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
