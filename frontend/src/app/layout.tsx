import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Forecast",
  description: "제품 예측 업무를 위한 웹앱",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
