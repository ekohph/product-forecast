import assert from "node:assert/strict";
import test from "node:test";
import {confirmUnsavedChanges, installUnsavedNavigationGuard} from "../src/features/plans/unsaved-changes.ts";

test("clean state never prompts; dirty state follows confirmation", () => {
  let calls = 0;
  const cancel = () => {calls++; return false;};
  assert.equal(confirmUnsavedChanges(false, cancel), true);
  assert.equal(calls, 0);
  assert.equal(confirmUnsavedChanges(true, cancel), false);
  assert.equal(confirmUnsavedChanges(true, () => true), true);
});

test("reload and close are blocked only while dirty, and listeners are removed", () => {
  const host = new EventTarget(); host.document = new EventTarget();
  let dirty = true;
  const remove = installUnsavedNavigationGuard(() => dirty, host);
  const fire = () => {const event = new Event("beforeunload", {cancelable: true}); host.dispatchEvent(event); return event.defaultPrevented;};
  assert.equal(fire(), true);
  dirty = false; assert.equal(fire(), false);
  dirty = true; remove(); assert.equal(fire(), false);
});

test("same-document navigation and back/forward obey cancel; downloads and hash links are excluded", () => {
  const host = new EventTarget(); host.document = new EventTarget(); host.navigation = new EventTarget();
  let accepted = false, calls = 0, dirty = true;
  host.confirm = () => {calls++; return accepted;};
  const remove = installUnsavedNavigationGuard(() => dirty, host);
  const navigate = (extra = {}) => {
    const event = Object.assign(new Event("navigate", {cancelable: true}), {canIntercept: true, hashChange: false, downloadRequest: null, ...extra});
    host.navigation.dispatchEvent(event); return event.defaultPrevented;
  };
  assert.equal(navigate({navigationType: "traverse"}), true);
  accepted = true; assert.equal(navigate(), false);
  dirty = false; assert.equal(navigate(), false);
  dirty = true;
  assert.equal(navigate({hashChange: true}), false);
  assert.equal(navigate({downloadRequest: "timeline.png"}), false);
  assert.equal(navigate({canIntercept: false}), false);
  assert.equal(calls, 2);
  remove(); accepted = false; assert.equal(navigate(), false);
});
