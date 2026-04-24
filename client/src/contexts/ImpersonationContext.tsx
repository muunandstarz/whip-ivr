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

  return (
    <ImpersonationContext.Provider
      value={{
        impersonating,
        setImpersonating,
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
