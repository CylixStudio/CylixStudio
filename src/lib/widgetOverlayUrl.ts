/**
 * Permanent OBS browser-source URL for a widget.
 * The path is only the widget's public token — layout, account settings,
 * and OAuth connection state are read from the saved widget, not the URL.
 */
export function widgetOverlayUrl(origin: string, publicToken: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/overlay/${encodeURIComponent(publicToken)}`;
}

/** Minted once when a widget row is inserted. Never call this on update. */
export function mintWidgetPublicToken(): string {
  return crypto.randomUUID();
}
