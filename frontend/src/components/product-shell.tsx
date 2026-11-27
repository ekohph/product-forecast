import type { ReactNode } from "react";
import { BASE_PATH } from "@/lib/paths";
import { standaloneChatEnabled } from "@/lib/features";

export function ProductShell({active, children}: {active: "roadmap" | "chat"; children: ReactNode}) {
  return <div className="product-shell">
    <aside className="product-sidebar">
      <nav aria-label="앱 메뉴">
        <a href={BASE_PATH} aria-current={active === "roadmap" ? "page" : undefined}>Product Forecast</a>
        {standaloneChatEnabled && <a href={`${BASE_PATH}/chat`} aria-current={active === "chat" ? "page" : undefined}>Chat</a>}
      </nav>
    </aside>
    <main className={active === "chat" ? "product-main chat-main" : "product-main"}>{children}</main>
  </div>;
}
