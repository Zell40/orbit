// Account management — draft/account-registration + the Django-backed password /
// challenge flows. REGISTER/VERIFY/RESEND go over IRC (client.ircv3); the password
// change and Turnstile completion hit the same-origin Django endpoints (which keep
// Anope + the website in sync). Split out of store.ts.
import i18n from '../i18n';
import { fetchTimeout } from '@/lib/net';
import type { StoreApi } from 'zustand';
import type { ChatState } from '../store';

interface AccountDeps {
  get: StoreApi<ChatState>['getState'];
  set: StoreApi<ChatState>['setState'];
}

export function makeAccount({ get, set }: AccountDeps) {
  function accountRegister(account: string, email: string, password: string): void {
    const { client } = get();
    if (!client) return;
    set({ reg: { step: 'idle', account, busy: true, error: '', info: '', challengeUrl: '' } });
    client.ircv3.register(account, email, password);
  }

  function accountVerify(code: string): void {
    const { client, reg } = get();
    if (!client || !reg.account) return;
    set({ reg: { ...reg, busy: true, error: '' } });
    client.ircv3.verify(reg.account, code);
  }

  function accountResend(): void {
    const { client, reg } = get();
    if (!client || !reg.account) return;
    set({ reg: { ...reg, error: '', info: i18n.t('reg.codeResent') } });
    client.ircv3.resend(reg.account);
  }

  // Change the account password via Django (same-origin proxy → swaygo). The
  // server updates BOTH Anope (IRC login) AND Django (website) so they never
  // drift — NOT a raw NickServ SET PASSWORD, which would only touch Anope.
  async function accountChangePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
    const account = get().account;
    if (!account) return { ok: false, message: i18n.t('reg.needAccount') };
    try {
      const res = await fetchTimeout('/accounts/api/change_password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (data.status === 'success') {
        return { ok: true, message: (data.message as string) || i18n.t('reg.passwordUpdated') };
      }
      return { ok: false, message: (data.message as string) || i18n.t('reg.passwordChangeFailed') };
    } catch {
      return { ok: false, message: i18n.t('reg.serviceUnavailable') };
    }
  }

  // Native Turnstile solved in-app → tell Django (same-origin via the
  // /cloudflare/ nginx proxy). On success Django auto-finishes the pending
  // REGISTER and e-mails the verification code.
  async function accountChallengeComplete(turnstileToken: string): Promise<void> {
    const reg = get().reg;
    let jwt = '';
    try { jwt = new URL(reg.challengeUrl).searchParams.get('token') || ''; } catch { /* bad url */ }
    set({ reg: { ...reg, busy: true, error: '' } });
    try {
      const res = await fetchTimeout('/cloudflare/verify_complete/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: jwt, verification_method: 'turnstile', turnstile_token: turnstileToken }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && data.success) {
        set({ reg: { ...get().reg, busy: false, challengeUrl: '', error: '',
          info: data.registration === 'sent'
            ? `✅ ${i18n.t('reg.challengeOkSent')}`
            : `✅ ${i18n.t('reg.challengeOkCheck')}` } });
      } else {
        set({ reg: { ...get().reg, busy: false,
          error: (data.message as string) || i18n.t('reg.challengeFail') } });
      }
    } catch {
      set({ reg: { ...get().reg, busy: false, error: i18n.t('reg.challengeUnreachable') } });
    }
  }

  function resetReg(): void {
    set({ reg: { step: 'idle', account: '', busy: false, error: '', info: '', challengeUrl: '' } });
  }

  return { accountRegister, accountVerify, accountResend, accountChangePassword, accountChallengeComplete, resetReg };
}
