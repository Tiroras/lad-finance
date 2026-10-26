import { useCallback, useEffect, useRef, useState } from "react";
import type { FinanceProfile } from "../../domain/profiles";
import { getDraftStorage } from "./draftStorage";
import {
  checkedDraftPayload,
  type DraftLease,
  type DraftLoad,
  type DraftSlot,
  type StoredDraft,
} from "./draftStore";

const serial = (value: unknown) => JSON.stringify(checkedDraftPayload(value));
const failureText = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Не удалось сохранить черновик.";

const pendingDrafts = new Set<Promise<void>>();

/** Drain complete form operations, including claim → save and unmount flushes. */
export async function settleStoredDrafts() {
  while (pendingDrafts.size) await Promise.allSettled([...pendingDrafts]);
}

/** Fields remain feature-owned; no draft is applied without the restore action. */
export function useStoredDraft<T extends object>(input: {
  profileId: FinanceProfile;
  slot: DraftSlot;
  recordId: string;
  payload: T;
  enabled: boolean;
  dirty?: boolean;
  parse(payload: unknown): T;
  onRestore(payload: T): void;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [offer, setOffer] = useState<StoredDraft | null>(null);
  const [resumed, setResumed] = useState(0);
  const [reload, setReload] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const latest = useRef(input);
  latest.current = input;
  const owner = `${input.profileId}/${input.slot}/${input.recordId}`;
  const ownerRef = useRef(owner);
  const ownerSession = useRef(0);
  if (ownerRef.current !== owner) ownerSession.current++;
  ownerRef.current = owner;
  const context = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const baseline = useRef<string | undefined>(undefined);
  const observed = useRef<DraftLoad | undefined>(undefined);
  const lease = useRef<DraftLease | undefined>(undefined);
  const offered = useRef<StoredDraft | null>(null);
  const initializedOwner = useRef<string | undefined>(undefined);
  const readyRef = useRef(false);
  const suspendedAt = useRef<string | undefined>(undefined);
  const restoring = useRef<string | undefined>(undefined);
  const attemptedWrite = useRef(false);
  const flushOnPause = useRef<() => void>(() => {});
  const stopTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  useEffect(() => {
    const generation = ++context.current;
    stopTimer();
    readyRef.current = false;
    setReady(false);
    if (initializedOwner.current !== owner) {
      initializedOwner.current = owner;
      observed.current = undefined;
      lease.current = undefined;
      offered.current = null;
      restoring.current = undefined;
      suspendedAt.current = undefined;
      attemptedWrite.current = false;
      setOffer(null);
      try {
        baseline.current = serial(latest.current.payload);
      } catch (failure) {
        setError(failureText(failure));
      }
    }
    if (!input.enabled)
      return () => {
        context.current++;
        stopTimer();
      };
    setError("");
    void getDraftStorage(input.profileId)
      .load(input.slot)
      .then((loaded) => {
        if (
          context.current !== generation ||
          ownerRef.current !== owner ||
          !latest.current.enabled
        )
          return;
        observed.current = loaded;
        if (loaded.blockedBy) {
          setError("Черновики недоступны до проверки результата замены учёта.");
          return;
        }
        const owns =
          lease.current?.token === loaded.token &&
          lease.current.generation === loaded.generation;
        if (!owns) {
          lease.current = undefined;
          offered.current = loaded.draft;
          setOffer(loaded.draft);
        }
        readyRef.current = true;
        setReady(true);
      })
      .catch((failure) => {
        if (
          context.current === generation &&
          ownerRef.current === owner &&
          latest.current.enabled
        )
          setError(failureText(failure));
      });
    return () => {
      // Capture the last available fields before disabling resets readiness and
      // cancels the debounce. The store still checks the profile/slot lease.
      if (!latest.current.enabled || !mounted.current) flushOnPause.current();
      context.current++;
      stopTimer();
    };
  }, [owner, input.enabled, input.profileId, input.slot, reload, stopTimer]);

  const enqueue = useCallback(
    (
      operation: (
        live: () => boolean,
        validOwner: () => boolean,
        sameSession: () => boolean,
      ) => Promise<void>,
      allowDisabled = false,
    ) => {
      const generation = context.current,
        capturedOwner = ownerRef.current,
        capturedSession = ownerSession.current;
      const sameSession = () =>
        ownerRef.current === capturedOwner &&
        ownerSession.current === capturedSession;
      const validOwner = () =>
        sameSession() &&
        (allowDisabled ||
          (context.current === generation &&
            latest.current.enabled &&
            mounted.current));
      const live = () => validOwner() && mounted.current;
      const next = pending.current
        .catch(() => {})
        .then(async () => {
          if (!validOwner())
            throw new Error("Форма уже закрыта или профиль изменился.");
          try {
            await operation(live, validOwner, sameSession);
          } catch (failure) {
            if (live()) setError(failureText(failure));
            throw failure;
          }
        });
      pending.current = next;
      pendingDrafts.add(next);
      void next.finally(() => pendingDrafts.delete(next)).catch(() => {});
      // A UI caller can await/retry the actual rejection. Keep autosave/unmount safe.
      void next.catch(() => {});
      return next;
    },
    [],
  );

  const persist = useCallback(
    (allowDisabled = false): Promise<void> => {
      stopTimer();
      const captured = latest.current;
      let payload: T, snapshot: string;
      try {
        payload = captured.parse(checkedDraftPayload(captured.payload));
        snapshot = serial(payload);
      } catch (failure) {
        setError(failureText(failure));
        return Promise.reject(failure);
      }
      const loaded = observed.current;
      const wasReady = readyRef.current;
      attemptedWrite.current = true;
      return enqueue(async (live, validOwner, sameSession) => {
        if (!(allowDisabled ? wasReady : readyRef.current) || !loaded)
          throw new Error("Дождитесь проверки сохранённого черновика.");
        if (offered.current)
          throw new Error(
            "Сначала восстановите или удалите сохранённый черновик.",
          );
        if (restoring.current !== undefined && restoring.current !== snapshot)
          throw new Error("Дождитесь восстановления полей черновика.");
        const store = getDraftStorage(captured.profileId);
        let currentLease = lease.current;
        if (!currentLease) {
          currentLease = await store.claim(
            { slot: captured.slot, recordId: captured.recordId },
            loaded,
          );
          // Claim already rotated the durable token. A pause continuation of
          // this same form must reuse it, even when the interactive write was
          // disabled while awaiting claim. Another owner/session cannot adopt
          // this lease; store.save still checks reset/replacement generations.
          if (sameSession()) lease.current = currentLease;
          if (!(allowDisabled ? validOwner() : live()))
            throw new Error("Форма уже закрыта или профиль изменился.");
        }
        const saved = await store.save(currentLease, payload);
        if (!(allowDisabled ? validOwner() : live()))
          throw new Error("Форма уже закрыта или профиль изменился.");
        lease.current = saved.lease;
        baseline.current = snapshot;
        restoring.current = undefined;
        if (live()) setError("");
      }, allowDisabled);
    },
    [enqueue, stopTimer],
  );
  const flush = useCallback(() => persist(), [persist]);

  flushOnPause.current = () => {
    if (
      initializedOwner.current !== ownerRef.current ||
      !readyRef.current ||
      offered.current
    )
      return;
    try {
      const current = latest.current;
      const snapshot = serial(current.payload);
      if (suspendedAt.current === snapshot || restoring.current !== undefined)
        return;
      if (current.dirty === false && !lease.current && !attemptedWrite.current)
        return;
      if (
        snapshot === baseline.current &&
        (lease.current || (!attemptedWrite.current && current.dirty !== true))
      )
        return;
      void persist(true).catch(() => {});
    } catch (failure) {
      if (mounted.current) setError(failureText(failure));
    }
  };

  const restore = useCallback(
    () =>
      enqueue(async (live) => {
        const captured = latest.current,
          draft = offered.current;
        if (!draft || !observed.current) return;
        if (draft.lease.recordId !== captured.recordId)
          throw new Error(
            "Этот черновик относится к другой записи. Откройте её или удалите черновик явно.",
          );
        const payload = captured.parse(draft.payload),
          snapshot = serial(payload);
        const claimed = await getDraftStorage(captured.profileId).claim(
          { slot: captured.slot, recordId: captured.recordId },
          observed.current,
        );
        if (!live()) return;
        lease.current = claimed;
        baseline.current = snapshot;
        restoring.current = snapshot;
        offered.current = null;
        setOffer(null);
        setError("");
        captured.onRestore(payload);
      }),
    [enqueue],
  );

  const discard = useCallback(() => {
    stopTimer();
    return enqueue(async (live) => {
      const captured = latest.current,
        draft = offered.current;
      const currentLease = draft?.lease ?? lease.current;
      if (currentLease)
        await getDraftStorage(captured.profileId).clear(currentLease);
      if (!live()) return;
      const loaded = await getDraftStorage(captured.profileId).load(
        captured.slot,
      );
      if (!live()) return;
      observed.current = loaded;
      lease.current = undefined;
      attemptedWrite.current = false;
      offered.current = null;
      restoring.current = undefined;
      setOffer(null);
      setError("");
    });
  }, [enqueue, stopTimer]);

  const suspend = useCallback(() => {
    stopTimer();
    try {
      suspendedAt.current = serial(latest.current.payload);
    } catch {
      suspendedAt.current = "";
    }
  }, [stopTimer]);
  const clear = useCallback(() => {
    if (ownerRef.current !== owner)
      return Promise.reject(new Error("Профиль или форма уже изменились."));
    suspend();
    return enqueue(async (live) => {
      const captured = latest.current;
      if (offered.current)
        throw new Error("Сохранённый черновик ещё не выбран.");
      if (lease.current)
        await getDraftStorage(captured.profileId).clear(lease.current);
      if (!live()) return;
      const loaded = await getDraftStorage(captured.profileId).load(
        captured.slot,
      );
      if (!live()) return;
      observed.current = loaded;
      lease.current = undefined;
      attemptedWrite.current = false;
      baseline.current = serial(latest.current.payload);
      setError("");
    }, true);
  }, [owner, enqueue, suspend]);
  const resume = useCallback(() => {
    suspendedAt.current = undefined;
    setResumed((value) => value + 1);
  }, []);
  const retry = useCallback(() => setReload((value) => value + 1), []);
  const discardAll = useCallback(() => {
    if (ownerRef.current !== owner)
      return Promise.reject(new Error("Профиль или форма уже изменились."));
    stopTimer();
    return enqueue(async (live) => {
      const captured = latest.current;
      await getDraftStorage(captured.profileId).purgeProfile();
      if (!live()) return;
      const loaded = await getDraftStorage(captured.profileId).load(
        captured.slot,
      );
      if (!live()) return;
      observed.current = loaded;
      lease.current = undefined;
      attemptedWrite.current = false;
      offered.current = null;
      restoring.current = undefined;
      baseline.current = serial(latest.current.payload);
      suspendedAt.current = baseline.current;
      readyRef.current = true;
      setReady(true);
      setOffer(null);
      setError("");
    });
  }, [owner, enqueue, stopTimer]);

  useEffect(() => {
    stopTimer();
    if (!input.enabled || !ready || offer) return;
    if (input.dirty === false && !lease.current && !attemptedWrite.current)
      return;
    let snapshot: string;
    try {
      snapshot = serial(input.payload);
    } catch (failure) {
      setError(failureText(failure));
      return;
    }
    if (restoring.current !== undefined) {
      if (snapshot !== restoring.current) return;
      restoring.current = undefined;
    }
    if (suspendedAt.current !== undefined) {
      if (snapshot === suspendedAt.current) return;
      suspendedAt.current = undefined;
    }
    if (
      snapshot === baseline.current &&
      (lease.current || (!attemptedWrite.current && input.dirty !== true))
    )
      return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void flush().catch(() => {});
    }, 500);
    return stopTimer;
  }, [
    input.enabled,
    input.dirty,
    input.payload,
    ready,
    offer,
    resumed,
    flush,
    stopTimer,
  ]);

  return {
    ready,
    error,
    offer,
    restore,
    discard,
    flush,
    clear,
    suspend,
    resume,
    retry,
    retryLoad: retry,
    discardAll,
  };
}
