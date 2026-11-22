"use client";

import { useState } from "react";
import { getHealth } from "@/lib/api";

export function HealthStatus() {
  const [message, setMessage] = useState("연결 확인 버튼으로 서비스 상태를 확인할 수 있습니다.");
  const [pending, setPending] = useState(false);

  async function checkHealth() {
    setPending(true);
    setMessage("서비스 연결을 확인하고 있습니다.");
    try {
      await getHealth();
      setMessage("서비스가 정상적으로 연결되었습니다.");
    } catch {
      setMessage("서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="status-card" aria-labelledby="connection-title">
      <h2 id="connection-title">서비스 연결</h2>
      <p role="status" aria-live="polite">{message}</p>
      <button type="button" disabled={pending} onClick={checkHealth}>
        {pending ? "확인 중…" : "연결 확인"}
      </button>
    </section>
  );
}
