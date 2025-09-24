import { useEffect, useRef, useState } from "react";

/**
 * usePoll(() => fetcher(), { interval: 5000, immediate: true })
 * - returns { data, error, loading, reload }
 */
export default function usePoll(
  fetchFn,
  { interval = 5000, immediate = true } = {}
) {
  const [state, setState] = useState({
    data: null,
    error: "",
    loading: !!immediate,
  });
  const timer = useRef(null);
  const alive = useRef(true);

  const load = async () => {
    try {
      if (alive.current) setState((s) => ({ ...s, loading: true, error: "" }));
      const data = await fetchFn();
      if (alive.current) setState({ data, error: "", loading: false });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "Request failed";
      if (alive.current)
        setState((s) => ({ ...s, error: msg, loading: false }));
    }
  };

  useEffect(() => {
    alive.current = true;
    if (immediate) load();
    timer.current = setInterval(load, interval);
    return () => {
      alive.current = false;
      clearInterval(timer.current);
    };
    // eslint-disable-next-line
  }, [interval]);

  return { ...state, reload: load };
}
