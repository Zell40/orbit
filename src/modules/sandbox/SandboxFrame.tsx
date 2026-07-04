import { useRef, useEffect } from 'react';

// Mounts a host-owned <iframe> into a UI slot. The iframe element is created once
// by the sandbox host and kept alive across renders — moving an iframe in the DOM
// reloads it (dropping the plugin), so we adopt the SAME node by reference here and
// hand it back to an offscreen holder on unmount instead of recreating it.
export function SandboxFrame({ iframe }: { iframe: HTMLIFrameElement }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (host) host.appendChild(iframe);
    return () => { if (iframe.parentNode === host) host?.removeChild(iframe); };
  }, [iframe]);
  return <span className="sbx-slot" ref={ref} />;
}
