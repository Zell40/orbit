import { useState } from 'react';
import type { OrbitPluginApi } from './orbit';

// A COMPILED Orbit plugin: real React/TSX with hooks, built to one droppable file
// (npm run build → dist/orbit-plugin-template.js). React is shared with the host,
// so hooks/state/context all work. Register against the Orbit global:
Orbit.plugin('orbit-template', (orbit, log) => {
  log('template plugin loaded — Orbit v' + orbit.version);

  // 1) A button in the composer (a real component).
  orbit.addUi('composer_button', () => <ShrugButton orbit={orbit} />);

  // 2) A whole Settings section (own nav entry + pane), with stateful UI.
  orbit.addSettingsSection({
    label: 'Template',
    icon: '🧩',
    render: () => <TemplatePanel orbit={orbit} />,
  });
});

function ShrugButton({ orbit }: { orbit: OrbitPluginApi }) {
  return (
    <button
      className="composer__emoji"
      title="Shrug (template plugin)"
      onClick={() => orbit.irc.say('¯\\_(ツ)_/¯')}
    >🤷</button>
  );
}

function TemplatePanel({ orbit }: { orbit: OrbitPluginApi }) {
  // Hooks work because the plugin shares Orbit's React instance.
  const [count, setCount] = useState<number>(() => orbit.storage.get('count', 0) ?? 0);
  const bump = () => { const n = count + 1; setCount(n); orbit.storage.set('count', n); };

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <div className="sfield__intro">
            This panel is a <b>compiled</b> plugin — real React with hooks, built to a
            single file and loaded via <code>config.json</code>. You're chatting as{' '}
            <b>{orbit.state.nick()}</b>.
          </div>
        </div>
        <div className="modal__actions">
          <button className="upbtn upbtn--primary" onClick={bump}>Clicked {count}×</button>
        </div>
      </div>
    </div>
  );
}
