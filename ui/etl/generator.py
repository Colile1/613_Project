# generator.py : local EXTRACT stage
# Mirrors simulator/producer.py (Poisson arrivals, bursts, duplicates,
# out-of-order and late events) on a simulated clock, so the whole pipeline
# can be demonstrated without Azure. Malformed events match producer.py's
# --malformed option; fraud spikes are a local-only demo knob.

import json
import math
import uuid
from datetime import timedelta
from pathlib import Path

from simulator.schema import MERCHANT_CATEGORIES, CITIES

# Same card pool as producer.py: every card in the reference data.
REFERENCE_PATH = Path(__file__).resolve().parents[2] / "reference_data" / "card_metadata.json"
CARDS = [row["card_id"] for row in json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))]
MERCHANTS = [f"MERCH-{i:03d}" for i in range(1, 21)]
MALFORMED_KINDS = ["transaction_id", "card_id", "amount", "merchant_category"]
ONE_SECOND = timedelta(seconds=1)

DEFAULT_CONFIG = {
    "rate": 10.0,           # baseline events/sec (producer.BASELINE_RATE)
    "burst_multiplier": 5,
    "burst_duration": 30,
    "burst_interval": 300,
    "duplicate_prob": 0.02,
    "out_of_order_prob": 0.05,
    "late_prob": 0.01,
    "malformed_prob": 0.01,  # producer.MALFORMED_PROB
    "fraud_prob": 0.005,     # local demo only: amount x8-x25
    "attack_prob": 0.01,     # local demo only: card-testing attack starts in a given second
    "amount_mu": 6.19,
    "amount_sigma": 0.38,
    "amount_max": 50000.0,
}


# Pure function: formats a datetime the way producer.iso() does.
def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# Pure function: log-normal ZAR amount, capped like the producer.
def sample_amount(cfg, rng):
    return min(math.exp(rng.gauss(cfg["amount_mu"], cfg["amount_sigma"])), cfg["amount_max"])


# Pure function: is a burst active at simulated second n (since start)?
# Scheduled bursts start after the first full interval, as in producer.py;
# burst_now covers a manual trigger (the producer's --burst flag).
def is_burst(cfg, n, burst_now):
    if burst_now:
        return True
    return n >= cfg["burst_interval"] and (n % cfg["burst_interval"]) < cfg["burst_duration"]


# Pure function: chooses event time and the timing anomaly for one event.
def pick_event_time(cfg, rng, now):
    r = rng.random()
    if r < cfg["late_prob"]:
        return now - timedelta(seconds=rng.uniform(300, 900)), "late"
    if r < cfg["late_prob"] + cfg["out_of_order_prob"]:
        return now - timedelta(seconds=rng.uniform(30, 120)), "out_of_order"
    return now, "on_time"


# Pure function: breaks one field so the dead-letter filter catches it.
def corrupt(body, rng):
    kind = rng.choice(MALFORMED_KINDS)
    body[kind] = -abs(body["amount"]) if kind == "amount" else None
    return kind


# Pure function: builds one event body plus audit metadata (keys start with _).
def build_event(cfg, rng, now, seq, duplicate_of=None):
    event_time, timing = pick_event_time(cfg, rng, now)
    city = rng.choice(CITIES)
    amount = sample_amount(cfg, rng)
    fraud = rng.random() < cfg["fraud_prob"]
    if fraud:
        amount = min(amount * rng.uniform(8, 25), cfg["amount_max"])
    body = {
        "transaction_id": duplicate_of or str(uuid.UUID(int=rng.getrandbits(128), version=4)),
        "card_id": rng.choice(CARDS),
        "merchant_id": rng.choice(MERCHANTS),
        "merchant_category": rng.choice(MERCHANT_CATEGORIES),
        "amount": round(amount, 2),
        "currency": "ZAR",
        "location": {
            "city": city["city"],
            "lat": round(city["lat"] + rng.uniform(-0.05, 0.05), 5),
            "lng": round(city["lng"] + rng.uniform(-0.05, 0.05), 5),
        },
        "event_time": iso(event_time),
        "ingestion_time": iso(now),
        "is_duplicate": duplicate_of is not None,
        "sequence_number": seq,
    }
    malformed = corrupt(body, rng) if rng.random() < cfg["malformed_prob"] else None
    body["_timing"] = timing
    body["_malformed"] = malformed
    body["_fraud_injected"] = fraud
    return body


# Pure function: generates every event arriving in simulated second [start, start+1s).
def generate_second(cfg, rng, start, elapsed, seq, recent_ids, burst_now=False):
    first_seq = seq
    burst = is_burst(cfg, elapsed, burst_now)
    rate = cfg["rate"] * (cfg["burst_multiplier"] if burst else 1)
    events, offset = [], rng.expovariate(rate)
    while offset < 1.0:
        now = start + timedelta(seconds=offset)
        dup = rng.choice(recent_ids) if recent_ids and rng.random() < cfg["duplicate_prob"] else None
        seq += 1
        ev = build_event(cfg, rng, now, seq, dup)
        ev["_burst"] = burst
        if dup is None and ev["transaction_id"]:
            recent_ids.append(ev["transaction_id"])
            del recent_ids[:-200]
        events.append(ev)
        offset += rng.expovariate(rate)
    if rng.random() < cfg["attack_prob"]:
        seq = card_testing_attack(cfg, rng, start, seq, events)
        events.sort(key=lambda e: e["ingestion_time"])
        for i, ev in enumerate(events):          # sequence order must stay arrival order
            ev["sequence_number"] = first_seq + i + 1
    return events, seq


# Pure function: one card fires 8-15 small transactions within a second (card testing).
def card_testing_attack(cfg, rng, start, seq, events):
    card, attack_id = rng.choice(CARDS), seq + 1
    for _ in range(rng.randint(8, 15)):
        seq += 1
        ev = build_event(dict(cfg, late_prob=0, out_of_order_prob=0, malformed_prob=0, fraud_prob=0),
                         rng, start + timedelta(seconds=rng.random()), seq)
        ev.update(card_id=card, merchant_category="online", amount=round(rng.uniform(5, 60), 2),
                  _attack=attack_id, _burst=False)
        events.append(ev)
    return seq
