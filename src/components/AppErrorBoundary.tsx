import { Component, type ReactNode } from 'react';
import i18n from '../core/i18n';

interface Props { children: ReactNode }
interface State { error: Error | null }

// Last-resort boundary around the WHOLE app. A render crash anywhere (a bug, an
// unexpected server message that throws during render, etc.) would otherwise
// unmount the entire React tree into a blank white page. Instead we show a small
// recovery screen with a reload button, and log the error to the console.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('[orbit] uncaught render error', error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash__box">
          <h1>{i18n.t('error.title', { defaultValue: 'Something went wrong' })}</h1>
          <p>{i18n.t('error.body', { defaultValue: 'The app hit an unexpected error. Reloading usually fixes it.' })}</p>
          <pre>{String(error.message || error)}</pre>
          <button className="crash__btn" onClick={() => window.location.reload()}>
            {i18n.t('error.reload', { defaultValue: 'Reload' })}
          </button>
        </div>
      </div>
    );
  }
}
