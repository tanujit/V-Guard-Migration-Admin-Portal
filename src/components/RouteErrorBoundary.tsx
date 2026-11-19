import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Route error boundary. A page chunk that fails to download (deployment replaced the files, network
 * dropped) or a page that throws shows a recoverable message instead of a blank screen. The boundary
 * resets when the route changes, so module navigation keeps working.
 */
const isChunkError = (e: Error) => /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(`${e.name} ${e.message}`);

export class RouteErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to render", error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    const chunk = isChunkError(e);
    return (
      <div className="page">
        <div className="route-error panel panel--pad" role="alert">
          <h2>{chunk ? "This page could not be loaded" : "This page ran into a problem"}</h2>
          <p className="muted">{chunk ? "Part of the portal did not download, usually because a newer version was deployed or the connection dropped. Reloading fetches the current version." : "The rest of the portal still works. Try again, or open another page from the menu."}</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}>{chunk ? "Reload the portal" : "Try again"}</button>
          </div>
        </div>
      </div>
    );
  }
}
