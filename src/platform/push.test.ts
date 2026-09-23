import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushDeviceId,
  handleWebPushListMessage,
  getPushDevicesState,
  requestPushDeviceList,
  removePushDevice,
  notePushActionFailure,
  clearPushActionError,
} from './push';
import type { IrcClient } from '../core/irc/client';

describe('push devices', () => {
  const mockClient = { ircv3: { webpushList: () => {} } } as unknown as IrcClient;

  beforeEach(() => {
    clearPushActionError();
    requestPushDeviceList(mockClient);
    handleWebPushListMessage('END', []);
  });

  it('computes a 16-hex device id from an endpoint', async () => {
    const id = await pushDeviceId('https://fcm.googleapis.com/fcm/send/abc');
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(await pushDeviceId('https://fcm.googleapis.com/fcm/send/abc')).toBe(id);
  });

  it('parses WEBPUSH DEVICE lines into state', () => {
    handleWebPushListMessage('DEVICE', ['abcd1234', 'fcm.googleapis.com', 'Zell', '100', '200', '1', '0']);
    handleWebPushListMessage('END', []);
    expect(getPushDevicesState()).toEqual({
      loading: false,
      listFailed: false,
      registerPending: false,
      actionError: null,
      devices: [{
        id: 'abcd1234',
        host: 'fcm.googleapis.com',
        nick: 'Zell',
        updated: 100,
        lastSuccess: 200,
        online: true,
        shared: false,
      }],
    });
  });

  it('requestPushDeviceList clears and sets loading', () => {
    handleWebPushListMessage('DEVICE', ['x', 'h', 'n', '1', '2', '0', '1']);
    handleWebPushListMessage('END', []);
    const client = { ircv3: { webpushList: () => {} } } as unknown as IrcClient;
    requestPushDeviceList(client);
    expect(getPushDevicesState()).toEqual({ loading: true, listFailed: false, registerPending: false, actionError: null, devices: [] });
  });

  it('surfaces a server FAIL for a click-initiated removal', async () => {
    const client = {
      ircv3: { webpushList: () => {}, webpushUnregisterTarget: () => true },
    } as unknown as IrcClient;
    handleWebPushListMessage('DEVICE', ['abcd1234', 'h', 'Zell', '1', '2', '0', '0']);
    handleWebPushListMessage('END', []);
    await removePushDevice(client, 'Zell', getPushDevicesState().devices[0], false);
    expect(notePushActionFailure('INVALID_PARAMS', 'Unknown Web Push device')).toBe(true);
    expect(getPushDevicesState().actionError)
      .toEqual({ kind: 'server', code: 'INVALID_PARAMS', desc: 'Unknown Web Push device' });
  });

  it('reports a removal that never left the client', async () => {
    const client = {
      ircv3: { webpushList: () => {}, webpushUnregisterTarget: () => false },
    } as unknown as IrcClient;
    handleWebPushListMessage('DEVICE', ['abcd1234', 'h', 'Zell', '1', '2', '0', '0']);
    handleWebPushListMessage('END', []);
    const device = getPushDevicesState().devices[0];
    await removePushDevice(client, 'Zell', device, false);
    expect(getPushDevicesState().actionError).toEqual({ kind: 'notSent' });
    expect(getPushDevicesState().devices).toContain(device);
  });

  it('ignores a FAIL that no click is waiting for', () => {
    expect(notePushActionFailure('FORBIDDEN', 'nope')).toBe(false);
    expect(getPushDevicesState().actionError).toBeNull();
  });
});
