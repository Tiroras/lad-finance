import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { mergeCurrencyRates } from "../../../domain/actions/currencies";
import { useSecurity } from "../../security";
import { fetchExchangeRates } from "../../../infrastructure/exchange-rates/exchangeRates";
import { useFinance } from "../../../state/finance";

const Context = createContext<{
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);
export function ExchangeRateProvider({ children }: { children: ReactNode }) {
  const { state, ready, loadError, today, update } = useFinance();
  const { locked } = useSecurity();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const attempted = useRef("");
  const automatic = state.settings.exchange?.automatic ?? true;
  const refresh = useCallback(async () => {
    if (request.current || !ready || loadError || locked) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const rates = await fetchExchangeRates(today, controller.signal);
      if (!controller.signal.aborted)
        update((current) => mergeCurrencyRates(current, rates, today));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Не удалось обновить курсы.");
    } finally {
      request.current = null;
      setBusy(false);
    }
  }, [today, ready, loadError, locked, update]);
  useEffect(() => {
    if (
      ready &&
      !loadError &&
      !locked &&
      automatic &&
      state.settings.exchange?.fetchedOn !== today &&
      attempted.current !== today
    ) {
      attempted.current = today;
      void refresh();
    }
  }, [
    ready,
    loadError,
    locked,
    automatic,
    today,
    state.settings.exchange?.fetchedOn,
    refresh,
  ]);
  useEffect(() => {
    if (locked || !automatic) request.current?.abort();
  }, [locked, automatic]);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  return (
    <Context.Provider value={{ busy, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useExchangeRates() {
  const value = useContext(Context);
  if (!value) throw new Error("ExchangeRateProvider missing");
  return value;
}
