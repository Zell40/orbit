/*
 * Orbit clock plugin — adds a live HH:MM clock to the topbar.
 *
 * Demonstrates the `topbar_item` UI slot and using React hooks through
 * orbit.React. Note the pattern: addUi returns an ELEMENT (orbit.h(Clock)), so
 * Clock is a real component that owns its own hook state across re-renders.
 *
 * Load via config.json:  "plugins": ["/app/plugins/orbit-clock.js"]
 */
Orbit.plugin('orbit-clock', (orbit, log) => {
  const { useState, useEffect } = orbit.React;

  function Clock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 15000);
      return () => clearInterval(id);
    }, []);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return orbit.html`
      <span
        title=${orbit.i18n.t('plugins.clock.title')}
        style=${{ fontWeight: 600, fontSize: '.82rem', lineHeight: '1', opacity: 0.7, padding: '0 .45rem', alignSelf: 'center' }}
      >${hh}:${mm}</span>
    `;
  }

  orbit.addUi('topbar_item', () => orbit.h(Clock));
  log('clock ready');
});
