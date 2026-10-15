"""
Credit Card Transaction Fraud Monitoring — Event Simulator
==========================================================
Sends realistic transaction events to Azure Event Hubs, simulating:
  - Variable throughput (Poisson-distributed inter-arrival times)
  - Burst traffic (5× rate for 30s every ~5 min)
  - Duplicate events (2% re-send with same transaction_id)
  - Out-of-order events (5% arrive with event_time 30–120s in the past)
  - Late-arriving events (1% arrive with event_time >5 min in the past)
  - Malformed events (1% have one broken field, to exercise the dead-letter path)
  - Log-normal amount distribution (mean ~R500, σ ~R200)

Usage:
    pip install azure-eventhub python-dotenv
    cp config.env.sample .env        # fill in connection string
    python producer.py               # run continuously (Ctrl+C to stop)
    python producer.py --burst       # immediately trigger a burst
    python producer.py --duration 60 # run for 60 seconds then exit
    python producer.py --malformed 0 # send no malformed events
"""

import argparse
import json
import logging
import math
import os
import random
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

from azure.eventhub import EventHubProducerClient, EventData

from schema import TransactionEvent, Location, MERCHANT_CATEGORIES, CITIES

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

CONNECTION_STRING = os.environ["EVENTHUB_CONNECTION_STRING"]
EVENTHUB_NAME = os.environ.get("EVENTHUB_NAME", "transactions")

# Card pool = every card in the reference data (5 000), so each event joins in
# ASA query 6 and per-card traffic stays realistic enough for the velocity rule
# (see docs/decisions/velocity_rule.md). Merchant pool is fixed.
REFERENCE_PATH = Path(__file__).resolve().parents[1] / "reference_data" / "card_metadata.json"
CARDS = [row["card_id"] for row in json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))]
NUM_CARDS = len(CARDS)
NUM_MERCHANTS = 20

MERCHANTS = [f"MERCH-{i:03d}" for i in range(1, NUM_MERCHANTS + 1)]

# Throughput
BASELINE_RATE = 10          # events/sec
BURST_MULTIPLIER = 5        # 5× during burst
BURST_DURATION_SEC = 30
BURST_INTERVAL_SEC = 300    # burst every ~5 min

# Anomaly probabilities
DUPLICATE_PROB = 0.02       # 2% duplicates
OUT_OF_ORDER_PROB = 0.05    # 5% out-of-order (30–120s in the past)
LATE_ARRIVAL_PROB = 0.01    # 1% late arrivals (>5 min in the past)
MALFORMED_PROB = 0.01       # 1% malformed (routed to dead_letter by ASA query 1)
MALFORMED_FIELDS = ["transaction_id", "card_id", "amount", "merchant_category"]

# Amount distribution: log-normal so most are small, rare large ones exist
# Target: mean ~R500, std ~R200 => underlying normal: mu=6.19, sigma=0.38
AMOUNT_MU = 6.19
AMOUNT_SIGMA = 0.38
AMOUNT_MAX = 50_000.0       # hard cap (ATM withdrawal limit)


# ── Helpers ──────────────────────────────────────────────────────────────────

_sequence = 0

def next_seq() -> int:
    global _sequence
    _sequence += 1
    return _sequence


def sample_amount() -> float:
    """Log-normal amount in ZAR, capped at AMOUNT_MAX."""
    return min(math.exp(random.gauss(AMOUNT_MU, AMOUNT_SIGMA)), AMOUNT_MAX)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def build_event(force_duplicate: str | None = None) -> TransactionEvent:
    """
    Build a single TransactionEvent, applying anomaly simulation rules.
    force_duplicate: if set, re-use this transaction_id (duplicate scenario).
    """
    is_dup = force_duplicate is not None
    tx_id = force_duplicate if is_dup else str(uuid.uuid4())

    now = now_utc()
    r = random.random()

    out_of_order = False
    late_arrival = False

    if r < LATE_ARRIVAL_PROB:
        # Event time is >5 min in the past (late arrival)
        delay_sec = random.uniform(300, 900)
        event_time = now - timedelta(seconds=delay_sec)
        late_arrival = True
    elif r < LATE_ARRIVAL_PROB + OUT_OF_ORDER_PROB:
        # Event time is 30–120s in the past (out-of-order)
        delay_sec = random.uniform(30, 120)
        event_time = now - timedelta(seconds=delay_sec)
        out_of_order = True
    else:
        event_time = now

    city_data = random.choice(CITIES)
    location = Location(
        city=city_data["city"],
        lat=city_data["lat"] + random.uniform(-0.05, 0.05),
        lng=city_data["lng"] + random.uniform(-0.05, 0.05),
    )

    return TransactionEvent(
        transaction_id=tx_id,
        card_id=random.choice(CARDS),
        merchant_id=random.choice(MERCHANTS),
        merchant_category=random.choice(MERCHANT_CATEGORIES),
        amount=sample_amount(),
        currency="ZAR",
        location=location,
        event_time=iso(event_time),
        ingestion_time=iso(now),
        is_duplicate=is_dup,
        sequence_number=next_seq(),
        _out_of_order=out_of_order,
        _late_arrival=late_arrival,
    )


def corrupt_body(body: dict) -> str:
    """Break one field so ASA's dead-letter filter catches the event. Returns the field name."""
    field = random.choice(MALFORMED_FIELDS)
    body[field] = -abs(body["amount"]) if field == "amount" else None
    return field


# ── Sending ──────────────────────────────────────────────────────────────────

def send_batch(client: EventHubProducerClient, events: list[TransactionEvent],
               malformed_prob: float = MALFORMED_PROB) -> None:
    """Send a list of events, each partitioned by card_id."""
    # Group by card_id so we can send with the correct partition key
    by_card: dict[str, list[TransactionEvent]] = {}
    for ev in events:
        by_card.setdefault(ev.card_id, []).append(ev)

    for card_id, card_events in by_card.items():
        batch = client.create_batch(partition_key=card_id)
        for ev in card_events:
            payload = ev.to_event_hub_body()
            if random.random() < malformed_prob:
                corrupt_body(payload)
            body = json.dumps(payload).encode("utf-8")
            batch.add(EventData(body))
        client.send_batch(batch)


# ── Main loop ─────────────────────────────────────────────────────────────────

def run(burst_immediately: bool = False, duration_sec: int | None = None,
        malformed_prob: float = MALFORMED_PROB) -> None:
    log.info("Connecting to Event Hubs: %s / %s", CONNECTION_STRING.split(";")[0], EVENTHUB_NAME)

    client = EventHubProducerClient.from_connection_string(
        conn_str=CONNECTION_STRING,
        eventhub_name=EVENTHUB_NAME,
    )

    start_time = time.monotonic()
    sent_total = 0
    burst_active = False
    burst_start = 0.0
    # First scheduled burst comes after one full interval; --burst starts one now.
    last_burst_trigger = start_time - BURST_INTERVAL_SEC if burst_immediately else start_time
    recent_tx_ids: list[str] = []  # pool for duplicate re-sends

    stats_interval = 10  # log stats every N seconds
    last_stats = time.monotonic()
    sent_since_stats = 0

    try:
        with client:
            log.info("Simulator running. Baseline rate: %d events/sec. Ctrl+C to stop.", BASELINE_RATE)
            while True:
                now_mono = time.monotonic()

                # Check duration limit
                if duration_sec and (now_mono - start_time) >= duration_sec:
                    log.info("Duration limit reached (%ds). Stopping.", duration_sec)
                    break

                # Burst trigger
                if (now_mono - last_burst_trigger) >= BURST_INTERVAL_SEC:
                    burst_active = True
                    burst_start = now_mono
                    last_burst_trigger = now_mono
                    log.info("BURST started (5× rate for %ds)", BURST_DURATION_SEC)

                if burst_active and (now_mono - burst_start) >= BURST_DURATION_SEC:
                    burst_active = False
                    log.info("BURST ended, returning to baseline")

                rate = BASELINE_RATE * (BURST_MULTIPLIER if burst_active else 1)

                # Build one event per "tick"
                r = random.random()
                if r < DUPLICATE_PROB and recent_tx_ids:
                    ev = build_event(force_duplicate=random.choice(recent_tx_ids))
                else:
                    ev = build_event()
                    recent_tx_ids.append(ev.transaction_id)
                    if len(recent_tx_ids) > 200:
                        recent_tx_ids.pop(0)

                send_batch(client, [ev], malformed_prob)
                sent_total += 1
                sent_since_stats += 1

                # Periodic stats log
                if (now_mono - last_stats) >= stats_interval:
                    throughput = sent_since_stats / (now_mono - last_stats)
                    log.info(
                        "Stats: sent=%d total | %.1f events/sec | burst=%s",
                        sent_total, throughput, burst_active,
                    )
                    last_stats = now_mono
                    sent_since_stats = 0

                # Sleep to maintain target rate (Poisson inter-arrival)
                sleep_sec = random.expovariate(rate)
                time.sleep(sleep_sec)

    except KeyboardInterrupt:
        log.info("Stopped by user. Total sent: %d", sent_total)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fraud pipeline event simulator")
    parser.add_argument("--burst", action="store_true", help="Trigger burst immediately on start")
    parser.add_argument("--duration", type=int, default=None, metavar="SECONDS",
                        help="Run for N seconds then exit")
    parser.add_argument("--malformed", type=float, default=MALFORMED_PROB, metavar="P",
                        help="Probability of a malformed event (default 0.01, 0 to disable)")
    args = parser.parse_args()
    run(burst_immediately=args.burst, duration_sec=args.duration, malformed_prob=args.malformed)
