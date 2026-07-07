// SASL SCRAM-SHA-256 client (RFC 5802) over Web Crypto.
//
// A salted challenge-response: the password never goes on the wire — only a proof
// derived from it. Multi-step (client-first → server-first → client-final →
// server-final → ack). The crypto mirrors the server's verifier derivation exactly
// (raw-UTF-8 password → PBKDF2-HMAC-SHA256 dkLen 32 → HMAC/SHA-256 keys), so a proof
// this builds validates against the Django-provisioned verifier. Salt + iteration
// count arrive in the server-first message, so this stays server-agnostic.

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Wrap/unwrap a SASL message for the wire (base64 of its UTF-8 bytes).
function wire(s: string): string { return toB64(enc.encode(s)); }
function unwire(b64: string): string { return new TextDecoder().decode(fromB64(b64)); }

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource));
}
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}
async function pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, k, 256);
  return new Uint8Array(bits);
}

// SCRAM attribute values are comma-free; parse `k=v,k=v,…` (v may itself contain '=').
function parseAttrs(msg: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of msg.split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}
// A SCRAM username escapes '=' (=3D) and ',' (=2C).
function saslName(user: string): string {
  return user.replace(/=/g, '=3D').replace(/,/g, '=2C');
}

export class ScramClient {
  started = false;         // client-first has been sent
  sentClientFinal = false; // client-final has been sent (next server message is server-final)
  private clientNonce = '';
  private clientFirstBare = '';
  private serverSignature: Uint8Array | null = null;

  // Step 1 — client-first, ready for the wire. gs2-header "n,," = no channel binding.
  clientFirst(user: string): string {
    const rnd = new Uint8Array(24);
    crypto.getRandomValues(rnd);
    this.clientNonce = toB64(rnd);
    this.clientFirstBare = `n=${saslName(user)},r=${this.clientNonce}`;
    this.started = true;
    return wire(`n,,${this.clientFirstBare}`);
  }

  // Step 2 — given the (wire) server-first, produce the (wire) client-final with proof.
  async clientFinal(serverFirstB64: string, password: string): Promise<string> {
    const serverFirst = unwire(serverFirstB64);
    const attrs = parseAttrs(serverFirst);
    const combinedNonce = attrs['r'] || '';
    const salt = attrs['s'] ? fromB64(attrs['s']) : new Uint8Array();
    const iterations = parseInt(attrs['i'] || '0', 10);
    // The server nonce must extend our client nonce (RFC 5802) — else reject.
    if (!combinedNonce.startsWith(this.clientNonce) || combinedNonce === this.clientNonce
        || !salt.length || !(iterations > 0)) {
      throw new Error('scram: invalid server-first');
    }

    const clientFinalBare = `c=biws,r=${combinedNonce}`;
    const saltedPassword = await pbkdf2(enc.encode(password), salt, iterations);
    const clientKey = await hmac(saltedPassword, enc.encode('Client Key'));
    const storedKey = await sha256(clientKey);
    const authMessage = enc.encode(`${this.clientFirstBare},${serverFirst},${clientFinalBare}`);
    const clientSignature = await hmac(storedKey, authMessage);
    const clientProof = xor(clientKey, clientSignature);
    // Remember the expected server signature to authenticate the server-final.
    const serverKey = await hmac(saltedPassword, enc.encode('Server Key'));
    this.serverSignature = await hmac(serverKey, authMessage);
    this.sentClientFinal = true;
    return wire(`${clientFinalBare},p=${toB64(clientProof)}`);
  }

  // Step 3 — verify the (wire) server-final proves the server holds the verifier.
  verifyServerFinal(serverFinalB64: string): boolean {
    const attrs = parseAttrs(unwire(serverFinalB64));
    if (attrs['e']) return false; // server signalled an error (e=…)
    const v = attrs['v'];
    if (!v || !this.serverSignature) return false;
    const got = fromB64(v);
    if (got.length !== this.serverSignature.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ this.serverSignature[i];
    return diff === 0;
  }
}
