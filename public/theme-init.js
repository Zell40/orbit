// Apply the saved theme before first paint so there's no flash of the light
// default on load/reload. Kept as an external (non-inline) script so the page
// CSP is satisfied by script-src 'self' with no per-script hash to maintain.
// Full theme logic runs later in src/ui/theme.ts.
try {
  var t = localStorage.getItem('orbit-theme') || localStorage.getItem('tchatou-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
