import { useEffect, useState } from 'react';

const useRecord = (client, kind, id, refresh = 0) => {
  const [result, setResult] = useState(null);
  const enabled = id != null;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    Promise.resolve()
      .then(() => client(kind, id, controller.signal))
      .then(
        (data) => {
          if (!controller.signal.aborted) setResult({ client, kind, id, refresh, data });
        },
        (error) => {
          if (!controller.signal.aborted)
            setResult({ client, kind, id, refresh, error: error.message });
        },
      );
    return () => controller.abort();
  }, [client, enabled, id, kind, refresh]);

  if (!enabled) return {};
  return result?.client === client &&
    result.kind === kind &&
    result.id === id &&
    result.refresh === refresh
    ? result
    : { loading: true };
};

export default useRecord;
