import { useTranslation } from 'react-i18next';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../../PluginBoundary';

/** Hub for optional IRC modes / privacy plugins (callerid, etc.). */
export function ModesSection() {
  const { t } = useTranslation();
  const pluginUi = usePluginRegistry((s) => s.ui);
  const modeItems = pluginUi.filter((u) => u.slot === 'settings_mode');

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <div className="sfield__intro">{t('settings.modes.intro')}</div>
        </div>
        {modeItems.length === 0 ? (
          <p className="srow__hint" style={{ margin: '0.5rem 0 0' }}>{t('settings.modes.empty')}</p>
        ) : (
          modeItems.map((item) => (
            <PluginBoundary key={item.id} render={item.render} label={`settings_mode:${item.plugin}`} />
          ))
        )}
      </div>
    </div>
  );
}
