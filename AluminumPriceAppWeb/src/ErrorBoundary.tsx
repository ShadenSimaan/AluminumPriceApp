// FILE: src/ErrorBoundary.tsx
import React from "react";

type Props = {
  children: React.ReactNode;
  storageKeys?: string[];
};

type State = {
  hasError: boolean;
  error?: any;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleClearStorage = () => {
    try {
      (this.props.storageKeys ?? []).forEach((k) => localStorage.removeItem(k));
      // Soft reload
      location.reload();
    } catch (e) {
      console.warn("Failed to clear storage", e);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        dir="rtl"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          background:
            "radial-gradient(ellipse at top right, rgba(14,165,233,.12), transparent 40%), radial-gradient(ellipse at bottom left, rgba(99,102,241,.12), transparent 40%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          color: "#0f172a",
          textAlign: "center",
        }}
      >
        <div
          style={{
            background: "white",
            boxShadow: "0 10px 30px rgba(2,6,23,0.08)",
            borderRadius: 16,
            padding: 24,
            maxWidth: 560,
          }}
        >
          <h1 style={{ marginTop: 0 }}>אופס… משהו השתבש</h1>
          <p style={{ margin: "8px 0 16px" }}>
            נתקבלה שגיאה במהלך טעינת האפליקציה. ייתכן שמידע שמור מקומי (localStorage) פגום או ישן.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => location.reload()}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "white",
                cursor: "pointer",
              }}
            >
              רענון הדף
            </button>
            <button
              onClick={this.handleClearStorage}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "none",
                background: "#0ea5e9",
                color: "white",
                cursor: "pointer",
              }}
            >
              ניקוי נתונים מקומיים וטעינה מחדש
            </button>
          </div>
          <pre
            dir="ltr"
            style={{
              textAlign: "left",
              overflow: "auto",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              padding: 12,
              borderRadius: 10,
              marginTop: 16,
              maxHeight: 240,
              fontSize: 12,
            }}
          >
{String(this.state.error ?? "")}
          </pre>
        </div>
      </div>
    );
  }
}
