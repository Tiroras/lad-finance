import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { mergeCurrencyRates } from "../../../domain/actions/currencies";
import { useSecurity } from "../../security";
import { fetchExchangeRates } from "../../../infrastructure/exchange-rates/exchangeRates";
import { useFinance, useFinanceStatus } from "../../../state/finance";

const Context = createContext<{
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);
export function ExchangeRateProvider({ children }: { children: ReactNode }) {
  const { state, today, update, profile } = useFinance();
  const { financeWriteBlocked } = useFinanceStatus();
  const { locked } = useSecurity();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const attempted = useRef("");
  const automatic = state.settings.exchange?.automatic ?? true;
  const scope = useRef({ profile, blocked: financeWriteBlocked || locked });
  scope.current = { profile, blocked: financeWriteBlocked || locked };
  const refresh = useCallback(async () => {
    if (request.current || scope.current.blocked) return;
    const controller = new AbortController();
    const capturedProfile = scope.current.profile;
    const isCurrent = () =>
      request.current === controller &&
      !controller.signal.aborted &&
      !scope.current.blocked &&
      scope.current.profile === capturedProfile;
    request.current = controller;
    attempted.current = today;
    setBusy(true);
    setError("");
    try {
      const rates = await fetchExchangeRates(today, controller.signal);
      if (isCurrent())
        update((current) => mergeCurrencyRates(current, rates, today));
    } catch (e) {
      if (isCurrent())
        setError(e instanceof Error ? e.message : "Не удалось обновить курсы.");
    } finally {
      // A cancelled request did not consume this day's automatic update.
      if (
        request.current === controller &&
        controller.signal.aborted &&
        attempted.current === today
      )
        attempted.current = "";
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }, [today, update]);
  useEffect(() => {
    attempted.current = "";
    setError("");
    return () => request.current?.abort();
  }, [profile]);
  useEffect(() => {
    if (
      !financeWriteBlocked &&
      !locked &&
      !busy &&
      automatic &&
      state.settings.exchange?.fetchedOn !== today &&
      attempted.current !== today
    ) {
      void refresh();
    }
  }, [
    financeWriteBlocked,
    locked,
    busy,
    automatic,
    today,
    state.settings.exchange?.fetchedOn,
    refresh,
  ]);
  useEffect(() => {
    if (locked || !automatic || financeWriteBlocked) request.current?.abort();
  }, [locked, automatic, financeWriteBlocked]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  const value = useMemo(
    () => ({ busy, error, refresh }),
    [busy, error, refresh],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useExchangeRates() {
  const value = useContext(Context);
  if (!value) throw new Error("ExchangeRateProvider missing");
  return value;
}
