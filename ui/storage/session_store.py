# session_store.py : session lifecycle backed by SQLite
# Mixed into PipelineSession: open / create / switch / rename / delete / save.
# The active session id lives in prefs, so the app reopens it after a restart.

from ui.storage import repositories as repo
from ui.storage import codec

ACTIVE_KEY = "_active_session"


class SessionStoreMixin:
    # Picks the session to open at start-up: the last active one, else the newest, else a new one.
    def initial_session_id(self):
        sid = repo.get_prefs(self.db).get(ACTIVE_KEY)
        if sid and repo.load_session(self.db, sid):
            return sid
        existing = repo.list_sessions(self.db)
        return existing[0]["id"] if existing else self.create_session("Session 1")

    # Creates an empty session and returns its id (does not open it).
    def create_session(self, name):
        with self.db.tx() as c:
            return repo.create_session(c, name.strip() or "Untitled session", {})

    # Loads a session's state and full event log into memory.
    def open_session(self, sid):
        self.stop()
        row = repo.load_session(self.db, sid)
        events = repo.load_events(self.db, sid)
        with self.lock:
            self.fresh()
            codec.apply_state(self, row["state"])
            self.session_id, self.session_name = sid, row["name"]
            self.events = events
            self.was_running = bool(row["state"].get("running"))
            self.restored_events = len(events)
            self.version += 1
            with self.db.tx() as c:
                repo.set_prefs(c, {ACTIVE_KEY: sid})
                repo.save_state(c, sid, codec.to_state(self))

    # Saves the current state (settings, clock, generator) without touching events.
    def save(self):
        with self.lock, self.db.tx() as c:
            repo.save_state(c, self.session_id, codec.to_state(self))

    # Starts a new empty session and switches to it.
    def new_session(self, name):
        self.save()
        self.open_session(self.create_session(name))

    # Switches to another stored session.
    def switch_session(self, sid):
        if sid != self.session_id and repo.load_session(self.db, sid):
            self.save()
            self.open_session(sid)

    # Renames a session.
    def rename_session(self, sid, name):
        with self.db.tx() as c:
            repo.rename_session(c, sid, name.strip() or "Untitled session")
        if sid == self.session_id:
            self.session_name = name.strip() or "Untitled session"

    # Deletes a session; deleting the open one moves to another (or a new one).
    def delete_session(self, sid):
        if sid == self.session_id:
            others = [s for s in repo.list_sessions(self.db) if s["id"] != sid]
            self.open_session(others[0]["id"] if others else self.create_session("Session 1"))
        with self.db.tx() as c:
            repo.delete_session(c, sid)