"use client";

import { useEffect, useRef, useState } from "react";
import { Schema, Slice, type Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { baseKeymap, splitBlock } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { history, redo, undo } from "prosemirror-history";
import { isComposingEnter } from "./composer-keys";

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

export function ChatComposer() {
  const mount = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const justComposedEnter = useRef(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [hasText, setHasText] = useState(false);
  const [ready, setReady] = useState(false);

  function submit(view: EditorView) {
    if (view.composing) return;
    const text = asText(view.state.doc).trim();
    if (!text) return;
    setMessages(items => [...items, text]);
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
        role: "textbox", "aria-label": "테스트 메시지", "aria-multiline": "true",
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
          if (text) editor.dispatch(editor.state.tr.replaceSelection(Slice.maxOpen(documentFor(text).content)).scrollIntoView());
          return true;
        },
        drop(_editor, event) {event.preventDefault(); return true;},
      },
      handleKeyDown(editor, event) {
        if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return false;
        if (justComposedEnter.current || isComposingEnter(event, editor.composing)) return false;
        if (event.shiftKey) return splitBlock(editor.state, editor.dispatch, editor);
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
    return () => {viewRef.current = null; view.destroy();};
  }, []);

  return <section className="chat-demo" aria-label="메시지 입력 테스트">
    <div className="chat-transcript" role="log" aria-live="polite" aria-label="이 화면에서 입력한 메시지">
      {messages.length ? <ol>
        {messages.map((message, i) => <li key={i}><span>내 입력</span><p>{message}</p></li>)}
      </ol> : <div className="chat-empty"><h2>입력 테스트</h2><p>예시 문장을 넣거나 직접 입력해 보세요.</p></div>}
    </div>
    <div className="chat-compose-card">
      <div className="chat-editor" ref={mount} />
      <div className="chat-compose-actions">
        <button type="button" className="secondary-button" disabled={!ready || hasText} onClick={() => {
          const view = viewRef.current;
          if (!view || view.composing) return;
          const doc = documentFor(sample);
          view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
          view.focus();
        }}>예시 문장 넣기</button>
        <p id="chat-key-hint">Enter 전송 · Shift+Enter 줄바꿈</p>
        <button type="button" disabled={!hasText} onClick={() => {if (viewRef.current) submit(viewRef.current);}}>전송</button>
      </div>
    </div>
  </section>;
}
