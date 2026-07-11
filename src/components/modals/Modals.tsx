import { SettingsModal } from '../settings/SettingsModal';
import { QuickSwitcher } from '../QuickSwitcher';
import { Shortcuts } from '../Shortcuts';
import { useActiveChat } from '@/core/networks';
import { JoinDialog } from './JoinDialog';
import { ExploreModal } from './ExploreModal';
import { ChanAdminModal } from './ChanAdminModal';
import { ReportModal } from './ReportModal';
import { PluginModal } from './PluginModal';

export function Modals() {
  const modal = useActiveChat((s) => s.modal);
  return (
    <>
      {modal === 'join' && <JoinDialog />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'explore' && <ExploreModal />}
      {modal === 'chanadmin' && <ChanAdminModal />}
      {modal === 'report' && <ReportModal />}
      {modal === 'switcher' && <QuickSwitcher />}
      {modal === 'shortcuts' && <Shortcuts />}
      <PluginModal />
    </>
  );
}
