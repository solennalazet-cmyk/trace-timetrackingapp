import { Component, type PropsWithChildren, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/error-log";
import { clearChunkReloadMarker, isChunkLoadError } from "@/lib/chunk-recovery";

interface Props extends PropsWithChildren {
  /** "screen" fills the viewport (route level), "inline" renders a small card. */
  variant?: "screen" | "inline";
  /** Optional label used in the inline message, e.g. "this panel". */
  label?: string;
}

interface State {
  error: unknown;
}

/**
 * Catches render-time crashes, records them in the local error log so they can
 * be read later from Account → Diagnostics, and shows a recoverable fallback
 * instead of a blank screen.
 */
class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    logError(error, "boundary");
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkError = isChunkLoadError(error);
    const { variant = "screen", label } = this.props;

    if (variant === "inline") {
      return (
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="text-sm font-medium text-card-foreground">
            Something went wrong{label ? ` in ${label}` : ""}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The rest of the app keeps working. Try again, or reload if it persists.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={this.reset}>
              Try again
            </Button>
            <Button
              size="sm"
              onClick={() => {
                clearChunkReloadMarker();
                window.location.reload();
              }}
            >
              Reload
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="gradient-bg flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center shadow-lg">
          <h1 className="text-xl font-semibold text-card-foreground">
            {chunkError ? "Trace needs a refresh" : "Trace could not start"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {chunkError
              ? "The app updated while this screen was loading. Reload to pick up the newest version."
              : "Reload the app. Your active timer data is kept locally."}
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => {
              clearChunkReloadMarker();
              window.location.reload();
            }}
          >
            Reload Trace
          </Button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
