export function isComposingEnter(event: Pick<KeyboardEvent, "key" | "isComposing" | "keyCode">, editorComposing: boolean): boolean {
  // Some desktop IMEs report the confirmation key as keyCode 229.
  return event.key === "Enter" && (event.isComposing || editorComposing || event.keyCode === 229);
}
