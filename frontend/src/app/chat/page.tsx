import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { standaloneChatEnabled } from "@/lib/features";
import { ProductShell } from "@/components/product-shell";
import { ChatComposer } from "@/features/chat/chat-composer";

export const metadata: Metadata = {title: "Chat | Product Forecast"};

export default function ChatPage() {
  if (!standaloneChatEnabled) notFound();
  return <ProductShell active="chat">
    <div className="chat-page">
      <p className="eyebrow">Product Forecast</p>
      <h1>Chat</h1>
      <p className="intro">입력창 동작을 확인하는 테스트 화면입니다. 입력한 내용은 서버에 보내거나 저장하지 않습니다.</p>
      <ChatComposer />
    </div>
  </ProductShell>;
}
