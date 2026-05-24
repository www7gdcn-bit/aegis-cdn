import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE = "AegisCDN";
const DESC =
  "企业级高防 CDN —— 智能防护、全球加速、永远在线。CC/WAF/DDoS 防护与边缘加速,5 分钟 CNAME 接入。";

export const metadata: Metadata = {
  metadataBase: new URL("https://aegiscdn.example"),
  title: {
    default: `${SITE} · Enterprise Anti-DDoS CDN`,
    template: `%s · ${SITE}`,
  },
  description: DESC,
  keywords: ["高防CDN", "DDoS防护", "CC防护", "WAF", "网站加速", "CDN", "边缘节点", "Anti-DDoS"],
  openGraph: {
    title: `${SITE} · Enterprise Anti-DDoS CDN`,
    description: DESC,
    type: "website",
    locale: "zh_CN",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0F",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
