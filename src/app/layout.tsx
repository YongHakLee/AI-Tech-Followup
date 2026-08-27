import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Tech Followup",
  description: "AI 분야 연구자와 기술자들의 새 글·논문·강연을 한국어 요약으로 따라갑니다.",
};

// 브라우저 크로미까지 테마를 따라가게 한다. 미디어 쿼리로 두 값을 주므로
// 저장된 선택과 어긋날 수 있지만, 첫 페인트에서 흰 띠가 번쩍이는 것보다는 낫다.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafd" },
    { media: "(prefers-color-scheme: dark)", color: "#0f141d" },
  ],
};

/**
 * 첫 페인트 전에 동기적으로 실행되어야 한다. 리액트가 하이드레이션할 때까지
 * 기다리면 다크 모드 사용자에게 흰 화면이 한 번 번쩍인다.
 * 실패하면 조용히 라이트로 둔다 — 테마 때문에 페이지가 죽어서는 안 된다.
 */
const THEME_INIT = `(function(){try{var v=null;try{v=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=v==='dark'||(v!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      // 위 스크립트가 서버가 그린 className을 페인트 전에 바꾼다.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
