# result_cache.py : cached pipeline result for the live session
# Mixed into PipelineSession. Recomputes the warehouse when new events arrive or
# settings change, but while the clock runs it reuses a recent result so large
# sessions stay responsive.

import time

from ui.etl import ingest, warehouse


class ResultCacheMixin:
    # Returns a snapshot of the events list.
    def snapshot(self):
        with self.lock:
            return list(self.events), self.version

    # Returns the cached pipeline result, recomputing when the version moved.
    def result(self):
        events, version = self.snapshot()
        with self.run_lock:
            if self.is_stale(version):
                started = time.monotonic()
                ingest.assign_partitions(events)
                self.cache = (version, events, warehouse.run_pipeline(events, self.policy, self.metadata))
                self.computed_at, self.cost = time.monotonic(), time.monotonic() - started
            return self.cache[1], self.cache[2]

    # While the clock runs, reuse a recent result so big sessions stay responsive.
    def is_stale(self, version):
        if self.cache is None:
            return True
        if self.cache[0] == version:
            return False
        if self.running:
            return time.monotonic() - self.computed_at > max(1.5, self.cost * 3)
        return True
