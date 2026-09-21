import { createContext, useContext } from "react";

interface SecurityContextValue {
  supported: boolean;
  enabled: boolean;
  locked: boolean;
  busy: boolean;
  error: string;
  unlock: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  lock: () => void;
}
export const SecurityContext = createContext<SecurityContextValue | null>(null);
export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) throw new Error("SecurityProvider missing");
  return context;
}
