import { Component, type ReactNode } from 'react';

// Calls a plugin's render() inside its own component so a throw happens during
// React's render of THIS subtree — which the boundary above can actually catch.
function PluginRender({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

interface Props { render: () => ReactNode; label?: string }
interface State { failed: boolean }

// Real error boundary around plugin-contributed UI: a faulty plugin renders
// nothing instead of taking down the app (try/catch can't catch render errors).
export class PluginBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error(`[plugins] ${this.props.label ?? 'render'} error`, error);
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return <PluginRender render={this.props.render} />;
  }
}
