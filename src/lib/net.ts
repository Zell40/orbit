// fetch() with an abort timeout, so a hung server socket can't leave an upload
// spinner or the registration flow stuck indefinitely waiting on the browser's
// own (very long) default timeout.
export function fetchTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}
