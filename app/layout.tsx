import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Апсуа Тур",
  applicationName: "Апсуа Тур",
  openGraph: {title:"Апсуа Тур",images:[{url:"https://apsua-tour-design.rkviii.chatgpt.site/api/app-icon-512.png",width:512,height:512}]},
  description: "Экскурсии и трансфер по Абхазии.",
  manifest: "/api/app-manifest.webmanifest",
  icons: {
    icon: "/api/app-icon-32.png",
    shortcut: "/api/app-icon-32.png",
    apple: "/api/app-icon-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head><link rel="stylesheet" href="/fonts.css?v=131" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
