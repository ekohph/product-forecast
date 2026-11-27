"use client";

import { useEffect, useRef, useState } from "react";
import { Schema, Slice, type Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, splitBlock } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { history, redo, undo } from "prosemirror-history";
import { isComposingEnter } from "./composer-keys";
import { chatImageIssue, chatImageTypes, clipboardImageFiles, maxChatImages } from "./chat-images";

const schema = new Schema({
  nodes: {
    doc: {content: "paragraph+"},
    paragraph: {content: "text*", group: "block", parseDOM: [{tag: "p"}], toDOM: () => ["p", 0]},
    text: {},
  },
});
const {Enter: _enter, "Shift-Enter": _shiftEnter, ...baseKeys} = baseKeymap;
const sample = "가상의 Demo Panel 일정을 확인해 주세요.\n다음 테스트의 날짜도 같이 확인하고 싶어요.";
const asText = (doc: Node) => doc.textBetween(0, doc.content.size, "\n");
const documentFor = (text: string) => schema.node("doc", null, text.split(/\r\n?|\n/).map(line =>
  schema.node("paragraph", null, line ? schema.text(line) : undefined)));

type Attachment = {url: string; name: string};
type ChatMessage = {text: string; images: Attachment[]};

export function ChatComposer({showSample = false}: {showSample?: boolean}) {
  const mount = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const viewRef = useRef<EditorView | null>(null);
  const justComposedEnter = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const draftImages = useRef<Attachment[]>([]);
  const objectUrls = useRef(new Set<string>());
  const [images, setImages] = useState<Attachment[]>([]);
  const [imageError, setImageError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasText, setHasText] = useState(false);
  const [ready, setReady] = useState(false);

  function scrollToLatest() {
    const log = transcript.current;
    if (log && followLatest.current) log.scrollTop = log.scrollHeight;
  }
  useEffect(scrollToLatest, [messages]);

  function addImages(files: File[]) {
    if (!files.length) return;
    const next = [...draftImages.current];
    let error = "";
    for (const file of files) {
      const problem = chatImageIssue(file);
      if (problem) {error ||= problem; continue;}
      if (next.length >= maxChatImages) {error ||= "메시지 하나에 이미지를 최대 4장까지 첨부할 수 있습니다."; break;}
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      next.push({url, name: file.name || "붙여넣은 이미지"});
    }
    draftImages.current = next;
    setImages(next);
    setImageError(error);
  }
  function removeImage(url: string) {
    draftImages.current = draftImages.current.filter(image => image.url !== url);
    setImages(draftImages.current);
    if (objectUrls.current.delete(url)) URL.revokeObjectURL(url);
  }

  function submit(view: EditorView) {
    if (view.composing) return;
    const text = asText(view.state.doc).trim();
    const attachments = draftImages.current;
    if (!text && !attachments.length) return;
    followLatest.current = true;
    setMessages(items => [...items, {text, images: attachments}]);
    draftImages.current = [];
    setImages([]);
    setImageError("");
    // A new message is a new history, so Undo does not resurrect sent text.
    view.updateState(createState());
    setHasText(false);
    view.focus();
  }
  function createState() {
    return EditorState.create({schema, plugins: [history(), keymap({"Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo}), keymap(baseKeys)]});
  }

  useEffect(() => {
    if (!mount.current) return;
    const view = new EditorView(mount.current, {
      state: createState(),
      attributes: {
        role: "textbox", "aria-label": "메시지 입력", "aria-multiline": "true",
        "aria-describedby": "chat-key-hint", spellcheck: "false",
      },
      handleDOMEvents: {
        // Capture the composition-confirming Enter before ProseMirror's browser-specific key handling.
        keydown(editor, event) {
          if (event.key === "Enter") justComposedEnter.current = isComposingEnter(event, editor.composing);
          return false;
        },
        paste(editor, event) {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          event.preventDefault();
          if (event.clipboardData) addImages(clipboardImageFiles(event.clipboardData));
          if (text) editor.dispatch(editor.state.tr.replaceSelection(Slice.maxOpen(documentFor(text).content)).scrollIntoView());
          return true;
        },
        drop(_editor, event) {event.preventDefault(); return true;},
      },
      handleKeyDown(editor, event) {
        if (event.key !== "Enter" || event.ctrlKey || event.metaKey) return false;
        if (justComposedEnter.current || isComposingEnter(event, editor.composing)) return false;
        if (event.altKey || event.shiftKey) return splitBlock(editor.state, editor.dispatch, editor);
        submit(editor);
        return true;
      },
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction));
        if (transaction.docChanged) setHasText(!!asText(view.state.doc).trim());
      },
    });
    viewRef.current = view;
    setReady(true);
    const urls = objectUrls.current;
    return () => {
      viewRef.current = null;
      view.destroy();
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  return <section className="chat-demo" aria-label="채팅">
    <div ref={transcript} className="chat-transcript" role="log" tabIndex={0} aria-live="polite" aria-label="대화 기록"
      onScroll={event => {const log = event.currentTarget; followLatest.current = log.scrollHeight - log.scrollTop - log.clientHeight < 8;}}>
      {messages.length > 0 && <ol>
        {messages.map((message, i) => <li key={i}>
          {message.text && <p>{message.text}</p>}
          {!!message.images.length && <div className="chat-sent-images">
            {message.images.map(image => <img key={image.url} src={image.url} alt={image.name} onLoad={scrollToLatest} />)}
          </div>}
        </li>)}
      </ol>}
    </div>
    <div className="chat-compose-card">
      {!!images.length && <ul className="chat-image-previews" aria-label="첨부 이미지 미리보기">
        {images.map((image, index) => <li key={image.url}>
          <img src={image.url} alt={image.name} onError={() => {removeImage(image.url); setImageError("이 이미지 파일을 열 수 없습니다.");}} />
          <button type="button" onClick={() => {removeImage(image.url); setImageError("");}}
            aria-label={`첨부 이미지 ${index + 1} 삭제`} title={image.name + " 삭제"}>×</button>
        </li>)}
      </ul>}
      {imageError && <p role="alert" className="chat-image-error">{imageError}</p>}
      <div className="chat-editor" ref={mount} />
      <div className="chat-compose-actions">
        <input ref={picker} type="file" multiple hidden accept={chatImageTypes.join(",")} onChange={event => {
          addImages(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
          viewRef.current?.focus();
        }} />
        <button type="button" className="secondary-button chat-add-image" aria-label="이미지 추가"
          title="이미지 추가" disabled={!ready} onClick={() => picker.current?.click()}>+</button>
        {showSample && <button type="button" className="secondary-button" disabled={!ready || hasText} onClick={() => {
          const view = viewRef.current;
          if (!view || view.composing) return;
          const doc = documentFor(sample);
          view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
          view.focus();
        }}>예시 문장 넣기</button>}
        <p id="chat-key-hint">Enter 전송 · Alt+Enter 줄바꿈 · Ctrl+V 이미지 붙여넣기</p>
        <button type="button" disabled={!hasText && !images.length} onClick={() => {if (viewRef.current) submit(viewRef.current);}}>전송</button>
      </div>
    </div>
  </section>;
}
