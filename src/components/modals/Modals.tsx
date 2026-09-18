import { lazy, Suspense } from 'react';
import { useActiveChat } from '@/core/networks';
import { PluginModal } from './PluginModal';

// Every modal here is opened by a user action, never at boot, so none of them
// belongs in the chunk that has to arrive before the chat paints. Settings and
// ChanAdmin alone are a third of the app bundle. `lazy` splits each into its own
// chunk, fetched on the click that opens it.
const JoinDialog = lazy(() => import('./JoinDialog').then((m) => ({ default: m.JoinDialog })));
const SettingsModal = lazy(() => import('../settings/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const ExploreModal = lazy(() => import('./ExploreModal').then((m) => ({ default: m.ExploreModal })));
const ChanAdminModal = lazy(() => import('./ChanAdminModal').then((m) => ({ default: m.ChanAdminModal })));
const ReportModal = lazy(() => import('./ReportModal').then((m) => ({ default: m.ReportModal })));
const ModeratedModal = lazy(() => import('./ModeratedModal').then((m) => ({ default: m.ModeratedModal })));
const QuickSwitcher = lazy(() => import('../QuickSwitcher').then((m) => ({ default: m.QuickSwitcher })));
const Shortcuts = lazy(() => import('../Shortcuts').then((m) => ({ default: m.Shortcuts })));

export function Modals() {
  const modal = useActiveChat((s) => s.modal);
  return (
    <>
      {/* No fallback: a modal chunk is a few KB off a warm connection, and an
          empty frame reads better than a spinner that flashes for 30 ms. */}
      <Suspense fallback={null}>
        {modal === 'join' && <JoinDialog />}
        {modal === 'settings' && <SettingsModal />}
        {modal === 'explore' && <ExploreModal />}
        {modal === 'chanadmin' && <ChanAdminModal />}
        {modal === 'report' && <ReportModal />}
        {modal === 'moderated' && <ModeratedModal />}
        {modal === 'switcher' && <QuickSwitcher />}
        {modal === 'shortcuts' && <Shortcuts />}
      </Suspense>
      <PluginModal />
    </>
  );
}
