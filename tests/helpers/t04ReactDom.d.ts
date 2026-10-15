// The browser hook harness uses only these ReactDOM entry points. Keeping this
// narrow test declaration avoids adding a dependency to the application.
declare module "react-dom/client" {
  import type { ReactNode } from "react";
  export interface Root {
    render(node: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}
declare module "react-dom" {
  export function flushSync<T>(callback: () => T): T;
}
