// Escape a string for safe interpolation into HTML that is then set via
// dangerouslySetInnerHTML. i18next runs with escapeValue:false (React escapes
// normal t() output), so any value going into a raw-HTML sink must be escaped
// here. Covers both element-content and attribute contexts.
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;'
      : c === '<' ? '&lt;'
        : c === '>' ? '&gt;'
          : c === '"' ? '&quot;'
            : '&#39;'
  ));
}
