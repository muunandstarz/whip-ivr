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

  // Sync to sessionStorage so the tRPC fetch interceptor can read it
  const setImpersonatingWithStorage = (handler: ImpersonatedHandler | null) => {
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
