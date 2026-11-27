import assert from "node:assert/strict";
import test from "node:test";
import {isComposingEnter} from "../src/features/chat/composer-keys.ts";

test("Enter that commits IME composition never sends a message", () => {
  const enter = {key: "Enter", isComposing: false, keyCode: 13};
  assert.equal(isComposingEnter(enter, false), false);
  assert.equal(isComposingEnter({...enter, isComposing: true}, false), true);
  assert.equal(isComposingEnter({...enter, keyCode: 229}, false), true);
  assert.equal(isComposingEnter(enter, true), true);
  assert.equal(isComposingEnter({...enter, key: "a"}, true), false);
});

test("attachment validation rejects unsupported and out-of-limit files", async () => {
  const {chatImageIssue, maxChatImageBytes, clipboardImageFiles} = await import("../src/features/chat/chat-images.ts");
  assert.equal(chatImageIssue({type: "image/png", size: 10}), null);
  assert.notEqual(chatImageIssue({type: "image/svg+xml", size: 10}), null);
  assert.notEqual(chatImageIssue({type: "image/jpeg", size: 0}), null);
  assert.notEqual(chatImageIssue({type: "image/webp", size: maxChatImageBytes + 1}), null);
  const png = new File(["PNG"], "image.png", {type: "image/png"});
  assert.deepEqual(clipboardImageFiles({items: [{kind: "file", getAsFile: () => png}], files: [png]}), [png]);
  assert.deepEqual(clipboardImageFiles({items: [], files: [png]}), [png]);
});
