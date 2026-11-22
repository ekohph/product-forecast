export const unsavedChangesMessage = "저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?";

export function confirmUnsavedChanges(dirty: boolean, confirm: (message: string) => boolean): boolean {
  return !dirty || confirm(unsavedChangesMessage);
}

// Native beforeunload covers reload, closing, address-bar and cross-document travel.
// The Navigation API covers cancellable same-document history/SPA navigation.
export function installUnsavedNavigationGuard(isDirty: () => boolean, host: Window) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return;
    event.preventDefault(); event.returnValue = "";
  };
  type NavigationEvent = Event & {canIntercept: boolean; hashChange: boolean; downloadRequest: string | null};
  const navigation = (host as Window & {navigation?: EventTarget}).navigation;
  const navigate = (event: Event) => {
    const change = event as NavigationEvent;
    if (!change.canIntercept || !change.cancelable || change.hashChange || change.downloadRequest != null) return;
    if (!confirmUnsavedChanges(isDirty(), message => host.confirm(message))) event.preventDefault();
  };
  const click = (event: MouseEvent) => {
    if (navigation || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href, host.location.href);
    if (destination.origin !== host.location.origin || destination.href === host.location.href || (destination.pathname === host.location.pathname && destination.search === host.location.search)) return;
    if (!confirmUnsavedChanges(isDirty(), message => host.confirm(message))) {event.preventDefault(); event.stopImmediatePropagation();}
  };
  host.addEventListener("beforeunload", beforeUnload);
  navigation?.addEventListener("navigate", navigate);
  host.document.addEventListener("click", click, true);
  return () => {
    host.removeEventListener("beforeunload", beforeUnload);
    navigation?.removeEventListener("navigate", navigate);
    host.document.removeEventListener("click", click, true);
  };
}
