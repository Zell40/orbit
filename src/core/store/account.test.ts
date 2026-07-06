import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeAccount } from './account';
import type { ChatState } from '../store';

function fakeClient() {
  const calls: [string, unknown[]][] = [];
  const rec = (n: string) => (...a: unknown[]) => { calls.push([n, a]); };
  return { ircv3: { register: rec('register'), verify: rec('verify'), resend: rec('resend') }, calls };
}

function setup(over: Record<string, unknown> = {}) {
  const client = fakeClient();
  const state = {
    client, account: '',
    reg: { step: 'idle', account: '', busy: false, error: '', info: '', challengeUrl: '' },
    ...over,
  };
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  return { ...makeAccount({ get, set } as Parameters<typeof makeAccount>[0]), client, state };
}

const okJson = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe('account — IRC flows', () => {
  it('accountRegister sends REGISTER and marks the reg busy', () => {
    const { accountRegister, client, state } = setup();
    accountRegister('bob', 'b@x.com', 'pw');
    expect(client.calls).toEqual([['register', ['bob', 'b@x.com', 'pw']]]);
    expect(state.reg).toMatchObject({ account: 'bob', busy: true });
  });

  it('accountVerify sends VERIFY for the pending account', () => {
    const { accountVerify, client } = setup({ reg: { step: 'code', account: 'bob', busy: false, error: '', info: '', challengeUrl: '' } });
    accountVerify('123456');
    expect(client.calls).toEqual([['verify', ['bob', '123456']]]);
  });

  it('resetReg clears the registration state', () => {
    const { resetReg, state } = setup({ reg: { step: 'code', account: 'bob', busy: true, error: 'x', info: 'y', challengeUrl: 'z' } });
    resetReg();
    expect(state.reg).toMatchObject({ step: 'idle', account: '', busy: false, error: '', challengeUrl: '' });
  });
});

describe('account — Django flows', () => {
  it('accountChangePassword requires an account', async () => {
    const { accountChangePassword } = setup({ account: '' });
    expect(await accountChangePassword('a', 'b')).toMatchObject({ ok: false });
  });

  it('accountChangePassword returns ok on a success response', async () => {
    const { accountChangePassword } = setup({ account: 'bob' });
    vi.stubGlobal('fetch', okJson({ status: 'success', message: 'done' }));
    expect(await accountChangePassword('old', 'new')).toEqual({ ok: true, message: 'done' });
  });

  it('accountChangePassword returns not-ok on failure', async () => {
    const { accountChangePassword } = setup({ account: 'bob' });
    vi.stubGlobal('fetch', okJson({ status: 'error', message: 'wrong password' }));
    expect(await accountChangePassword('old', 'new')).toMatchObject({ ok: false, message: 'wrong password' });
  });

  it('accountChallengeComplete finishes the pending registration', async () => {
    const { accountChallengeComplete, state } = setup({
      reg: { step: 'code', account: 'bob', busy: false, error: '', info: '', challengeUrl: 'https://x/verify?token=jwt123' },
    });
    vi.stubGlobal('fetch', okJson({ success: true, registration: 'sent' }));
    await accountChallengeComplete('turnstile-tok');
    expect(state.reg).toMatchObject({ busy: false, challengeUrl: '' });
    expect(state.reg.info).toContain('✅');
  });
});
