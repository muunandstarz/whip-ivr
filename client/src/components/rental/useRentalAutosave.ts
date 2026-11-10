import { useCallback, useEffect, useRef, useState } from "react";
import type { RentalDraft } from "@shared/rentalHandoff";
import { errorMessage } from "./Controls";
export type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";
export function useRentalAutosave<T = RentalDraft>({
  id,
  initialDraft,
  initialRevision,
  locked,
  validationError = "",
  save,
}: {
  id: number;
  initialDraft: T;
  initialRevision: number;
  locked: boolean;
  validationError?: string;
  save: (input: {
    id: number;
    revision: number;
    draft: T;
  }) => Promise<{ revision: number }>;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const current = useRef(initialDraft);
  const persisted = useRef(JSON.stringify(initialDraft));
  const revision = useRef(initialRevision);
  const running = useRef<Promise<number> | null>(null);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const saveRef = useRef(save);
  saveRef.current = save;
  const validationRef = useRef(validationError);
  validationRef.current = validationError;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async (): Promise<number> => {
    clearTimeout(timer.current);
    if (running.current) {
      await running.current;
      return flush();
    }
    if (stopped.current)
      throw new Error("Resolve the save error before continuing.");
    if (
      lockedRef.current ||
      JSON.stringify(current.current) === persisted.current
    )
      return revision.current;
    if (validationRef.current) throw new Error(validationRef.current);
    const snapshot = current.current;
    const serialized = JSON.stringify(snapshot);
    if (mounted.current) setState("saving");
    const request = saveRef
      .current({ id, revision: revision.current, draft: snapshot })
      .then(result => {
        revision.current = result.revision;
        persisted.current = serialized;
        if (mounted.current) {
          setState(
            JSON.stringify(current.current) === serialized ? "saved" : "unsaved"
          );
          setError("");
        }
        return result.revision;
      })
      .catch(e => {
        stopped.current = true;
        if (mounted.current) {
          setError(errorMessage(e));
          setState(
            (e as { data?: { code?: string } }).data?.code === "CONFLICT" ||
              /conflict|revision|another user/i.test(errorMessage(e))
              ? "conflict"
              : "error"
          );
        }
        throw e;
      })
      .finally(() => {
        running.current = null;
      });
    running.current = request;
    await request;
    if (
      JSON.stringify(current.current) !== persisted.current &&
      !lockedRef.current
    )
      return flush();
    return revision.current;
  }, [id]);
  const update = useCallback(
    (next: T, forceSave = false) => {
      if (lockedRef.current) return;
      // An explicit first measurement may equal an unsaved numeric placeholder (zero).
      if (forceSave) persisted.current = "";
      current.current = next;
      setDraft(next);
      if (!stopped.current) setState(JSON.stringify(next) === persisted.current && !running.current ? "saved" : "unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 600);
    },
    [flush]
  );
  const retry = useCallback(async () => {
    stopped.current = false;
    setError("");
    return flush();
  }, [flush]);
  useEffect(() => {
    mounted.current = true;
    const unload = (e: BeforeUnloadEvent) => {
      if (
        JSON.stringify(current.current) !== persisted.current ||
        running.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", unload);
      clearTimeout(timer.current);
      if (!lockedRef.current && !stopped.current) void flush().catch(() => {});
    };
  }, [flush]);
  return { draft, update, state, error, flush, retry, revision };
}
