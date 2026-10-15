# codec.py : converts the live session to and from the JSON stored in sessions.state
# The random generator state is saved too, so a restored session continues with
# exactly the events it would have produced without the restart.

import random
from datetime import datetime

from ui.etl import generator, transform


# Pure function: random.Random state -> JSON-safe list.
def encode_rng(state):
    version, internal, gauss = state
    return [version, list(internal), gauss]


# Pure function: JSON list -> random.Random state tuple.
def decode_rng(data):
    return (data[0], tuple(data[1]), data[2])


# Pure function: everything needed to continue a session later.
def to_state(s):
    return {
        "config": s.config, "policy": s.policy, "clock": s.clock.isoformat(),
        "seq": s.seq, "elapsed": s.elapsed, "rng": encode_rng(s.rng.getstate()),
        "recent_ids": s.recent_ids, "burst_until": s.burst_until,
        "speed": s.speed, "running": s.running,
    }


# Pure function: merges saved settings over defaults (new keys keep their default).
def merged(defaults, saved):
    out = dict(defaults)
    out.update({k: type(defaults[k])(v) for k, v in (saved or {}).items() if k in defaults})
    return out


# Applies a saved state to a freshly reset session object.
def apply_state(s, state):
    s.config = merged(generator.DEFAULT_CONFIG, state.get("config"))
    s.policy = merged(transform.DEFAULT_POLICY, state.get("policy"))
    if "clock" in state:
        s.clock = datetime.fromisoformat(state["clock"])
        s.seq, s.elapsed = state["seq"], state["elapsed"]
        s.recent_ids = list(state.get("recent_ids", []))
        s.burst_until = state.get("burst_until", -1)
        s.speed = state.get("speed", 10)
    if state.get("rng"):
        s.rng = random.Random()
        s.rng.setstate(decode_rng(state["rng"]))