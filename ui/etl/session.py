# session.py : the live pipeline session
# Holds generated events, runs the simulated clock on a background thread and
# caches the pipeline result. Every generated second is appended to SQLite in
# the same step, so the session survives restarts (see ui/storage).

import random
import threading
import time
from datetime import datetime, timezone

from ui.etl import generator, ingest, transform
from ui.etl.enrich import get_card_metadata
from ui.storage import repositories as repo
from ui.storage import codec
from ui.storage.session_store import SessionStoreMixin
from ui.etl.result_cache import ResultCacheMixin

MAX_EVENTS = 40000


class PipelineSession(SessionStoreMixin, ResultCacheMixin):
    # Opens the last active session from the database (or creates the first one).
    def __init__(self, db):
        self.db = db
        self.lock, self.run_lock = threading.RLock(), threading.Lock()
        self.metadata = get_card_metadata()
        self.tiers = {k: v["customer_tier"] for k, v in self.metadata.items()}
        self.thread, self.running, self.speed = None, False, 10
        self.fresh()
        self.open_session(self.initial_session_id())

    # Resets in-memory state to an empty session with default settings.
    def fresh(self, keep_settings=False):
        if not keep_settings:
            self.config = dict(generator.DEFAULT_CONFIG)
            self.policy = dict(transform.DEFAULT_POLICY)
        self.events, self.recent_ids, self.seq, self.elapsed = [], [], 0, 0
        self.rng = random.Random()
        self.clock = datetime.now(timezone.utc).replace(microsecond=0)
        self.burst_until, self.version, self.cache = -1, getattr(self, "version", 0) + 1, None
        self.computed_at, self.cost = 0.0, 0.0
        self.was_running, self.restored_events = False, 0

    # Clears this session's events (settings are kept) and restarts its clock.
    def reset(self, seed=None):
        self.stop()
        with self.lock:
            self.fresh(keep_settings=True)
            self.rng = random.Random(seed)
            with self.db.tx() as c:
                repo.clear_events(c, self.session_id)
                repo.save_state(c, self.session_id, codec.to_state(self))

    # Generates n simulated seconds of traffic and commits them in one transaction.
    def advance(self, n):
        with self.lock:
            new = []
            for _ in range(int(n)):
                if len(self.events) + len(new) >= MAX_EVENTS:
                    self.running = False
                    break
                evs, self.seq = generator.generate_second(
                    self.config, self.rng, self.clock, self.elapsed, self.seq,
                    self.recent_ids, self.elapsed < self.burst_until)
                for ev in evs:
                    ev["_partition"] = ingest.partition_for(ev["card_id"], ev["sequence_number"])
                new.extend(evs)
                self.clock += generator.ONE_SECOND
                self.elapsed += 1
            with self.db.tx() as c:
                repo.append_events(c, self.session_id, new)
                repo.save_state(c, self.session_id, codec.to_state(self))
            self.events.extend(new)
            self.version += 1

    # Forces a burst for the configured burst duration from now (like --burst).
    def trigger_burst(self):
        with self.lock:
            self.burst_until = self.elapsed + self.config["burst_duration"]
        self.save()

    # Starts the background clock at `speed` simulated seconds per real second.
    def start(self, speed):
        self.speed = max(1, min(int(speed), 120))
        self.was_running = False
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
        self.save()

    # Stops the background clock and waits for the last tick to be committed.
    def stop(self):
        self.running = False
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=3)
        self.thread = None
        if hasattr(self, "session_id"):
            self.save()

    # Thread body: advances the clock in 0.5 s real-time ticks.
    def _loop(self):
        carry = 0.0
        while self.running:
            carry += self.speed * 0.5
            whole = int(carry)
            carry -= whole
            self.advance(whole)
            time.sleep(0.5)

    # Updates simulator config or ASA policy keys that already exist, then saves.
    def update(self, target, values):
        store = self.config if target == "config" else self.policy
        with self.lock:
            for key, value in values.items():
                if key in store:
                    store[key] = type(store[key])(value)
            self.version += 1
        self.save()

    # Status dict for the top bar (includes which saved session is open).
    def status(self):
        with self.lock:
            return {"running": self.running, "speed": self.speed, "events": len(self.events),
                    "sim_clock": generator.iso(self.clock), "elapsed_s": self.elapsed,
                    "burst": generator.is_burst(self.config, self.elapsed, self.elapsed < self.burst_until),
                    "max_events": MAX_EVENTS, "session_id": self.session_id, "session_name": self.session_name,
                    "was_running": self.was_running, "restored_events": self.restored_events}