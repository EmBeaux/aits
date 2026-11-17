import { useEffect, useMemo, useState } from 'react';

const useRunList = (client, query, revision) => {
  const search = useMemo(() => ({ client, query, revision }), [client, query, revision]);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(null);
  const request = page?.search === search ? page : null;
  const cursor = request?.cursor;

  useEffect(() => {
    if (query == null) return;
    const controller = new AbortController();
    const params = new URLSearchParams(query);
    if (cursor) params.set('after', cursor);
    Promise.resolve()
      .then(() => client('runs', params.toString(), controller.signal))
      .then(
        (data) => {
          if (controller.signal.aborted) return;
          setResult((previous) => {
            const existing = cursor && previous?.search === search ? previous.runs : [];
            const seen = new Set(existing.map((run) => run.root));
            const runs = [...existing, ...data.runs.filter((run) => !seen.has(run.root))];
            return { search, request, runs, total: data.total, nextCursor: data.next_cursor };
          });
        },
        (error) => {
          if (controller.signal.aborted) return;
          setResult((previous) => ({
            ...(cursor && previous?.search === search ? previous : { runs: [] }),
            search,
            request,
            error: error.message,
          }));
        },
      );
    return () => controller.abort();
  }, [client, cursor, query, request, search]);

  const current = result?.search === search ? result : null;
  const loading = query != null && (!current || current.request !== request);
  const nextCursor = current?.nextCursor;
  return {
    runs: current?.runs ?? [],
    total: current?.total,
    error: current?.error,
    loading,
    nextCursor,
    loadMore: () => {
      if (!loading && nextCursor) setPage({ search, cursor: nextCursor });
    },
  };
};

export default useRunList;
