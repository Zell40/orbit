import { describe, it, expect } from 'vitest';
import { ScramClient } from './scram';

// A REAL verifier produced by Django accounts/scram.py make_verifier('KnownPass123', 4096).
// This tests the actual client crypto against the real server-side derivation +
// m_apiauth's proof check — the interop path the fake-server unit test can't prove.
const PASSWORD = 'KnownPass123';
const SALT_B64 = 'JjF50wbewRcdMJzAMsb1uw==';
const STORED_KEY_B64 = 'VoiYA70fdPTU2nUpUJFtGRSe8BoP6W/ubOhBu0yAwMs=';
const SERVER_KEY_B64 = 'dS5AGpBBrnoru7Eq8HAWWu1fQdeLQOJ0iJihblj1JLQ=';
const ITER = 4096;

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

describe('SCRAM interop with a REAL Django verifier', () => {
  it('client proof validates against the Django stored_key (m_apiauth verify)', async () => {
    const storedKey = ub64(STORED_KEY_B64);
    const serverKey = ub64(SERVER_KEY_B64);

    const c = new ScramClient();
    const clientFirstWire = c.clientFirst('mik');
    const cf = unwire(clientFirstWire);                       // "n,,n=mik,r=cnonce"
    const clientFirstBare = cf.slice(cf.indexOf('n=', 3));
    const cnonce = clientFirstBare.split('r=')[1];
    const combined = cnonce + b64(crypto.getRandomValues(new Uint8Array(18)));
    const serverFirst = `r=${combined},s=${SALT_B64},i=${ITER}`;

    const finalWire = await c.clientFinal(wire(serverFirst), PASSWORD);
    const cfinal = unwire(finalWire);                        // "c=biws,r=...,p=..."
    const woProof = cfinal.slice(0, cfinal.indexOf(',p='));
    const proof = ub64(cfinal.split('p=')[1]);

    const authMessage = enc.encode(`${clientFirstBare},${serverFirst},${woProof}`);
    const clientSig = await hmac(storedKey, authMessage);
    const recovered = xor(proof, clientSig);
    expect(Array.from(await sha256(recovered))).toEqual(Array.from(storedKey)); // proof accepted

    const serverSig = await hmac(serverKey, authMessage);
    expect(c.verifyServerFinal(wire(`v=${b64(serverSig)}`))).toBe(true);        // server authenticated
  });
});
