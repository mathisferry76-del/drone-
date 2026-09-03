"use client";

import { Component, Suspense, type ReactNode } from "react";

// useGLTF (drei) suspends while loading and throws if the file 404s — with
// no model uploaded yet at a given path, that throw would otherwise take
// down the whole scene. This catches it locally so each scene can fall
// back to its placeholder geometry until a real .glb lands at that path,
// with zero code changes needed here once it does.
class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Swallow — this is an expected "model not uploaded yet" state, not a
    // real bug worth logging.
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export default function ModelBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModelErrorBoundary>
  );
}
