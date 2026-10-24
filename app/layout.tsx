import type { Metadata } from "next";
import "./globals.css";
import "./question.css";
import "./history.css";

export const metadata: Metadata = {
  title: "MemoDash · 记忆日常",
  description: "让每个单词，在恰好的时候重逢。基于 FSRS 的单词学习。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
