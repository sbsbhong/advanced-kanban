import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advanced Kanban",
  description: "쿼드런트 드롭과 리사이즈가 가능한 고급 칸반 보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
