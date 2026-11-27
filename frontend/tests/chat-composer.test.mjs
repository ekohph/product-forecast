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
