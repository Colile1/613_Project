# api_write.py : POST endpoints of the JSON API (actions that change state)

from ui.integrations.process_runner import producer_args
from ui.integrations import powerbi_export


# POST /api/sim/start {speed}
def sim_start(ctx, body):
    ctx.session.start(body.get("speed", 10))
    return {"ok": True}


# POST /api/sim/stop
def sim_stop(ctx, body):
    ctx.session.stop()
    return {"ok": True}


# POST /api/sim/speed {speed} - remembered for the next start, applied live if running
def sim_speed(ctx, body):
    ctx.session.speed = max(1, min(int(body.get("speed", 10)), 120))
    ctx.session.save()
    return {"ok": True}


# POST /api/sim/reset {seed}
def sim_reset(ctx, body):
    ctx.session.stop()
    seed = body.get("seed")
    ctx.session.reset(int(seed) if seed not in (None, "") else None)
    return {"ok": True}


# POST /api/sim/advance {seconds}
def sim_advance(ctx, body):
    ctx.session.advance(max(1, min(int(body.get("seconds", 60)), 3600)))
    return {"ok": True}


# POST /api/sim/burst
def sim_burst(ctx, body):
    ctx.session.trigger_burst()
    return {"ok": True}


# POST /api/sim/config {...}
def sim_config(ctx, body):
    ctx.session.update("config", body)
    return {"ok": True, "config": ctx.session.config}


# POST /api/transform/policy {...}
def transform_policy(ctx, body):
    ctx.session.update("policy", body)
    return {"ok": True, "policy": ctx.session.policy}


# POST /api/azure/producer {duration, burst}
def azure_producer(ctx, body):
    started = ctx.runner.start("producer", producer_args(body.get("duration", 60), body.get("burst"), body.get("malformed", 0.01), body.get("rate", 10)), "simulator")
    return {"ok": started, "error": None if started else "a process is already running"}


# POST /api/export/powerbi - writes the local warehouse as CSV + Power Query files
def export_powerbi(ctx, body):
    _, result = ctx.session.result()
    return {"ok": True, **powerbi_export.export(result["collections"], ctx.session.metadata, ctx.session.session_name)}


# POST /api/azure/install
def azure_install(ctx, body):
    started = ctx.runner.start("install", ["-m", "pip", "install", "-r", "requirements.txt"], "simulator")
    return {"ok": started, "error": None if started else "a process is already running"}


# POST /api/azure/stop
def azure_stop(ctx, body):
    return {"ok": ctx.runner.stop()}
