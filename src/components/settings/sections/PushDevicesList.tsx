import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import {
  getPushDevicesState,
  subscribePushDevices,
  requestPushDeviceList,
  removePushDevice,
  localPushDeviceId,
  isPushSupported,
} from '@/platform/push';

function fmtTs(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

export function PushDevicesList() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const account = useActiveChat((s) => s.account);
  const hasVapid = !!client?.server.vapid;
  const { devices, loading, listFailed } = useSyncExternalStore(subscribePushDevices, getPushDevicesState, getPushDevicesState);
  const [localId, setLocalId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!client || !account || !hasVapid || !isPushSupported()) return;
    void localPushDeviceId().then(setLocalId);
    requestPushDeviceList(client);
  }, [client, account, hasVapid]);

  if (!isPushSupported() || !hasVapid || !account) return null;

  return (
    <div className="sfield push-devices">
      <div className="sfield__label">📱 {t('settings.notifications.pushDevicesLabel')}</div>
      <div className="srow__hint">{t('settings.notifications.pushDevicesHint')}</div>
      {listFailed
        ? <div className="srow__hint">{t('settings.notifications.pushDevicesUnavailable')}</div>
        : loading && !devices.length
        ? <div className="srow__hint">{t('settings.notifications.pushDevicesLoading')}</div>
        : !devices.length
          ? <div className="srow__hint">{t('settings.notifications.pushDevicesEmpty')}</div>
          : (
            <ul className="push-devices__list">
              {devices.map((d) => {
                const isLocal = d.id === localId;
                return (
                  <li key={d.id} className={`push-devices__item${isLocal ? ' push-devices__item--local' : ''}`}>
                    <div className="push-devices__main">
                      <div className="push-devices__title">
                        {isLocal ? t('settings.notifications.pushDeviceThis') : d.host}
                        {isLocal && d.host !== '?' ? ` · ${d.host}` : ''}
                      </div>
                      <div className="push-devices__meta">
                        {d.online
                          ? t('settings.notifications.pushDeviceOnline', { nick: d.nick })
                          : t('settings.notifications.pushDeviceOffline', { nick: d.nick })}
                        {' · '}
                        {t('settings.notifications.pushDeviceUpdated', { date: fmtTs(d.updated) })}
                      </div>
                      {d.shared && (
                        <div className="push-devices__warn">{t('settings.notifications.pushDeviceShared')}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="upbtn upbtn--sm upbtn--danger"
                      disabled={!!busyId}
                      onClick={() => {
                        if (!client || busyId) return;
                        setBusyId(d.id);
                        void removePushDevice(client, account, d, isLocal).finally(() => {
                          setBusyId('');
                          requestPushDeviceList(client);
                        });
                      }}
                    >
                      {t('settings.notifications.pushDeviceRemove')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
    </div>
  );
}
