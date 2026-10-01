import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { Modal } from './Modal';

// Phone / tablet: focusing a search field on open pops the virtual keyboard
// over the list. Same test as the composer (skipComposerAutofocus).
function skipFieldAutofocus(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(hover: none)').matches;
}

// A modal opened by a plugin via orbit.modal(): the core owns the shell, the
// plugin owns the body (rendered inside its own error boundary).
export function PluginModal() {
  const spec = usePluginRegistry((s) => s.modal);
  const close = usePluginRegistry((s) => s.closeModal);
  if (!spec) return null;
  const autoFocus = spec.autoFocus ?? !skipFieldAutofocus();
  return (
    <Modal title={spec.title || ''} wide={spec.wide} onClose={close} autoFocus={autoFocus}>
      <PluginBoundary render={spec.render} label="modal" />
    </Modal>
  );
}
