"use client";

import {useRef, useState} from "react";
import {createRoadmapLink} from "./roadmap-link";

export function RoadmapShare({selection, ready}: {selection: {product: string; phase: string; version: string}; ready: boolean}) {
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  return <div className="roadmap-share">
    <button type="button" className="secondary-button" title="현재 제품·Phase·Version의 저장된 로드맵 조회 링크를 복사합니다." disabled={!ready || !selection.product || !selection.phase || !selection.version} onClick={async () => {
      const url = createRoadmapLink(window.location.href, selection);
      setNotice("");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url); setNotice("링크를 복사했습니다.");
      } catch {setLink(url); dialog.current?.showModal();}
    }}>링크 복사</button>
    <span className="overlay-note" role="status">{notice}</span>
    <dialog ref={dialog} className="option-dialog" aria-labelledby="share-link-title">
      <div className="option-dialog-header"><h2 id="share-link-title">로드맵 공유 링크</h2><button type="button" onClick={() => dialog.current?.close()}>닫기</button></div>
      <p>아래 주소를 복사해 공유하세요. 저장된 로드맵의 조회 화면이 열립니다.</p>
      <input aria-label="로드맵 공유 URL" readOnly value={link} onFocus={event => event.target.select()} style={{width: "100%"}} />
    </dialog>
  </div>;
}
