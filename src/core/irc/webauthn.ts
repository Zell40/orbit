// WebAuthn passkey assertion for the SASL WEBAUTHN mechanism.
//
// The ircd's WEBAUTHN mechanism (m_apiauth) sends a fresh random challenge as its
// server-first SASL message; we run navigator.credentials.get() over it and return
// the assertion serialized exactly as the website's passkey login does, so the same
// Django verifier (py_webauthn) validates it. Empty allowCredentials means the
// browser offers whatever discoverable passkeys the authenticator holds —
// no username needed; the passkey itself identifies the account.

function bufToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when this browser can do WebAuthn — used to gate the passkey UI. */
export function passkeySupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined' && !!navigator.credentials?.get;
}

/**
 * Run a passkey assertion over the SASL challenge and return it serialized as the
 * JSON the Django verifier expects (the same shape the website login posts). Rejects
 * if the user cancels or the authenticator errors.
 */
export async function passkeyAssertion(challenge: Uint8Array): Promise<string> {
  // rpId must match the site's Relying Party. Derive it from the page so
  // a self-hoster on another domain works with no config, and so the apex + www hosts
  // both resolve to the registrable domain the passkey was created under.
  const rpId = location.hostname.replace(/^www\./, '');
  // Copy into a plain ArrayBuffer (a BufferSource the DOM types accept regardless of
  // the source array's backing-buffer type).
  const chal = new ArrayBuffer(challenge.byteLength);
  new Uint8Array(chal).set(challenge);
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: chal,
      rpId,
      userVerification: 'required',
      allowCredentials: [],
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey: no assertion');
  const r = cred.response as AuthenticatorAssertionResponse;
  return JSON.stringify({
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64u(r.clientDataJSON),
      authenticatorData: bufToB64u(r.authenticatorData),
      signature: bufToB64u(r.signature),
      userHandle: r.userHandle ? bufToB64u(r.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  });
}
