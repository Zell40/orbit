import { describe, it, expect } from 'vitest';
import { ScramClient } from './scram';

// Test-side crypto mirroring the server (m_apiauth / Django): derive the verifier
// from the password and run the server half of SCRAM-SHA-256, so a full exchange
// proves the client's proof validates and its server-final check works.
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const wire = (s: string) => b64(enc.encode(s));
const unwire = (s: string) => new TextDecoder().decode(ub64(s));
const xor = (a: Uint8Array, b: Uint8Array) => a.map((v, i) => v ^ b[i]);

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource));
}
const sha256 = async (d: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', d as BufferSource));
async function pbkdf2(pw: Uint8Array, salt: Uint8Array, it: number) {
  const k = await crypto.subtle.importKey('raw', pw as BufferSource, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: it, hash: 'SHA-256' }, k, 256));
}

async function fakeServer(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 4096;
  const salted = await pbkdf2(enc.encode(password), salt, iterations);
  const storedKey = await sha256(await hmac(salted, enc.encode('Client Key')));
  const serverKey = await hmac(salted, enc.encode('Server Key'));
  let clientFirstBare = '', serverFirst = '';
  return {
    serverFirst(clientFirstWire: string) {
      const cf = unwire(clientFirstWire);               // "n,,n=user,r=cnonce"
      clientFirstBare = cf.slice(cf.indexOf('n=', 3));  // drop the "n,," gs2-header
      const cnonce = clientFirstBare.split('r=')[1];
      const combined = cnonce + b64(crypto.getRandomValues(new Uint8Array(18)));
      serverFirst = `r=${combined},s=${b64(salt)},i=${iterations}`;
      return wire(serverFirst);
    },
    async verifyClientFinal(clientFinalWire: string) {
      const cfinal = unwire(clientFinalWire);           // "c=biws,r=...,p=..."
      const woProof = cfinal.slice(0, cfinal.indexOf(',p='));
      const proof = ub64(cfinal.split('p=')[1]);
      const authMessage = enc.encode(`${clientFirstBare},${serverFirst},${woProof}`);
      const recovered = xor(proof, await hmac(storedKey, authMessage));
      const ok = (await sha256(recovered)).every((v, i) => v === storedKey[i]);
      const serverSig = await hmac(serverKey, authMessage);
      return { ok, serverFinal: wire(`v=${b64(serverSig)}`) };
    },
  };
}

describe('SCRAM-SHA-256 client', () => {
  it('produces a well-formed client-first', () => {
    const c = new ScramClient();
    expect(unwire(c.clientFirst('alice'))).toMatch(/^n,,n=alice,r=.{16,}$/);
    expect(c.started).toBe(true);
  });

  it('escapes = and , in the username', () => {
    expect(unwire(new ScramClient().clientFirst('a=b,c'))).toMatch(/^n,,n=a=3Db=2Cc,r=/);
  });

  it('completes a full exchange with the right password', async () => {
    const c = new ScramClient();
    const s = await fakeServer('s3cr3t');
    const final = await c.clientFinal(s.serverFirst(c.clientFirst('alice')), 's3cr3t');
    const { ok, serverFinal } = await s.verifyClientFinal(final);
    expect(ok).toBe(true);                            // server accepts the proof
    expect(c.verifyServerFinal(serverFinal)).toBe(true); // client authenticates the server
  });

  it('a wrong password yields a proof the server rejects', async () => {
    const c = new ScramClient();
    const s = await fakeServer('correct');
    const final = await c.clientFinal(s.serverFirst(c.clientFirst('alice')), 'WRONG');
    expect((await s.verifyClientFinal(final)).ok).toBe(false);
  });

  it('rejects a server-first whose nonce does not extend the client nonce', async () => {
    const c = new ScramClient();
    c.clientFirst('alice');
    await expect(c.clientFinal(wire(`r=EVIL,s=${btoa('salt')},i=4096`), 'pw')).rejects.toThrow();
  });

  it('rejects a server-final with a bad signature', async () => {
    const c = new ScramClient();
    const s = await fakeServer('pw');
    await c.clientFinal(s.serverFirst(c.clientFirst('alice')), 'pw');
    expect(c.verifyServerFinal(wire('v=' + btoa('not-the-right-signature')))).toBe(false);
    expect(c.verifyServerFinal(wire('e=other-error'))).toBe(false);
  });
});
