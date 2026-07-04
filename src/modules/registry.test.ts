import { describe, it, expect, beforeEach } from 'vitest';
import { usePluginRegistry, type MessageInfo } from './registry';

const reset = () => usePluginRegistry.setState({ ui: [], decorators: [], actions: [] });

describe('plugin registry', () => {
  beforeEach(reset);

  it('adds UI to a named slot and removes it via the returned disposer', () => {
    const remove = usePluginRegistry.getState().addUi('topbar_item', 'p', () => null);
    const ui = usePluginRegistry.getState().ui;
    expect(ui).toHaveLength(1);
    expect(ui[0]).toMatchObject({ slot: 'topbar_item', plugin: 'p' });
    remove();
    expect(usePluginRegistry.getState().ui).toHaveLength(0);
  });

  it('keeps slots from different plugins independent', () => {
    usePluginRegistry.getState().addUi('sidebar_item', 'a', () => null);
    usePluginRegistry.getState().addUi('composer_button', 'b', () => null);
    const slots = usePluginRegistry.getState().ui.map((u) => u.slot);
    expect(slots).toEqual(['sidebar_item', 'composer_button']);
  });

  it('registers a message decorator and passes it the message info', () => {
    let seen: MessageInfo | null = null;
    const remove = usePluginRegistry.getState().addDecorator('p', (m) => { seen = m; return null; });
    const dec = usePluginRegistry.getState().decorators[0];
    const info: MessageInfo = { id: '1', nick: 'bob', text: 'hi', raw: 'hi', kind: 'privmsg', ts: 0, mine: false };
    dec.render(info);
    expect(seen).toEqual(info);
    remove();
    expect(usePluginRegistry.getState().decorators).toHaveLength(0);
  });

  it('registers a message action and passes it the message info', () => {
    let seen: MessageInfo | null = null;
    const remove = usePluginRegistry.getState().addAction('p', (m) => { seen = m; return null; });
    const act = usePluginRegistry.getState().actions[0];
    const info: MessageInfo = { id: '2', nick: 'amy', text: 'yo', raw: 'yo', kind: 'privmsg', ts: 0, mine: true };
    act.render(info);
    expect(seen).toEqual(info);
    remove();
    expect(usePluginRegistry.getState().actions).toHaveLength(0);
  });
});
