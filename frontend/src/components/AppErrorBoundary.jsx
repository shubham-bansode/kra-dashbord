import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console for debugging
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong.
          </h2>
          <p style={{ marginBottom: 12 }}>
            The app hit a runtime error. Open DevTools Console for details.
          </p>
          <pre
            style={{
              background: "#111827",
              color: "#f9fafb",
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {String(this.state.error?.message || this.state.error || "Unknown")}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              background: "#2563eb",
              color: "white",
              border: 0,
              padding: "10px 14px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
