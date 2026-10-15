# process_runner.py : runs one long-lived child process and keeps its output
# Used to start the real simulator/producer.py against Azure Event Hubs and
# to install the simulator requirements from the UI. Every run and every
# output line is stored in SQLite, so the log is still there after a restart.

import subprocess
import sys
import threading
from collections import deque

from ui.integrations.project_files import ROOT
from ui.storage import repositories as repo


class ProcessRunner:
    # Restores the last run's log and closes runs a previous instance left open.
    def __init__(self, db):
        self.db, self.proc, self.run_id = db, None, None
        with db.tx() as c:
            repo.close_open_runs(c)
        last = repo.latest_run(db)
        self.label = last["label"] if last else None
        self.lines = deque(last["lines"] if last else [], maxlen=400)
        self.count = 0

    # Is the child still running?
    def is_running(self):
        return self.proc is not None and self.proc.poll() is None

    # Stores and buffers one output line.
    def _line(self, text):
        self.lines.append(text)
        self.count += 1
        with self.db.tx() as c:
            repo.add_run_line(c, self.run_id, self.count, text)

    # Starts python with `args` in `cwd` unless something is already running.
    def start(self, label, args, cwd):
        if self.is_running():
            return False
        command = "python " + " ".join(args)
        with self.db.tx() as c:
            self.run_id = repo.start_run(c, label, command)
        self.lines.clear()
        self.label, self.count = label, 0
        self._line("> " + command)
        self.proc = subprocess.Popen(
            [sys.executable, *args], cwd=str(ROOT / cwd), stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        threading.Thread(target=self._pump, daemon=True).start()
        return True

    # Thread body: copies child output into the buffer and the database.
    def _pump(self):
        for line in self.proc.stdout:
            self._line(line.rstrip())
        code = self.proc.wait()
        self._line("[exited with code %s]" % code)
        with self.db.tx() as c:
            repo.end_run(c, self.run_id, code)

    # Stops the child process.
    def stop(self):
        if self.is_running():
            self.proc.terminate()
            return True
        return False

    # Status, output lines and run history for the UI.
    def status(self):
        return {"running": self.is_running(), "label": self.label, "lines": list(self.lines),
                "history": repo.list_runs(self.db)}


# Pure function: builds producer.py arguments from UI options.
def producer_args(duration, burst, malformed=0.01):
    args = ["producer.py", "--duration", str(max(5, min(int(duration), 3600))),
            "--malformed", str(max(0.0, min(float(malformed), 0.5)))]
    return args + ["--burst"] if burst else args