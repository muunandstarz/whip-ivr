import { createContext, useContext, useState, ReactNode } from "react";

export interface ImpersonatedHandler {
  id: number;
  name: string;
  email: string;
}

interface ImpersonationContextValue {
  impersonating: ImpersonatedHandler | null;
  setImpersonating: (handler: ImpersonatedHandler | null) => void;
  isImpersonating: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  impersonating: null,
  setImpersonating: () => {},
  isImpersonating: false,
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [impersonating, setImpersonating] = useState<ImpersonatedHandler | null>(null);

  // The active preview is intentionally in-memory. Persisting it can leave the
  // UI showing Admin View after a reload while API calls still read as a handler.
  const setImpersonatingWithStorage = (handler: ImpersonatedHandler | null) => {
    (window as typeof window & { __whipActiveImpersonation?: string }).__whipActiveImpersonation = handler ? String(handler.id) : undefined;
    if (handler) {
      sessionStorage.setItem("impersonating_handler_id", String(handler.id));
    } else {
      sessionStorage.removeItem("impersonating_handler_id");
    }
    setImpersonating(handler);
  };

  return (
    <ImpersonationContext.Provider
      value={{
        impersonating,
        setImpersonating: setImpersonatingWithStorage,
        isImpersonating: impersonating !== null,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
