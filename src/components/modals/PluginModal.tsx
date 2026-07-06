import { usePluginRegistry } from '../../modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { Modal } from './Modal';

// A modal opened by a plugin via orbit.modal(): the core owns the shell, the
// plugin owns the body (rendered inside its own error boundary).
export function PluginModal() {
  const spec = usePluginRegistry((s) => s.modal);
  const close = usePluginRegistry((s) => s.closeModal);
  if (!spec) return null;
  return (
    <Modal title={spec.title || ''} wide={spec.wide} onClose={close}>
      <PluginBoundary render={spec.render} label="modal" />
    </Modal>
  );
}
