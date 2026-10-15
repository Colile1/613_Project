# ingest.py : INGEST stage (Azure Event Hubs model)
# Models the "transactions" hub: 4 partitions keyed by card_id. Event Hubs uses
# its own internal hash, so the partition shown here is a stable approximation
# (CRC32 of the key); the distribution behaviour is what matters for the demo.

import zlib
from collections import Counter

from ui.etl.timeutil import parse_iso, floor_second, seconds_between, iso_s

PARTITION_COUNT = 4
HUB_CONFIG = {
    "namespace": "itri613colile-ehns",
    "hub": "transactions",
    "partitions": PARTITION_COUNT,
    "retention_days": 1,
    "consumer_group": "stream-analytics",
    "partition_key": "card_id",
    "tier": "Standard (1 TU)",
}


# Pure function: maps a partition key to a partition (None -> round robin by seq).
def partition_for(card_id, seq):
    if card_id is None:
        return seq % PARTITION_COUNT
    return zlib.crc32(card_id.encode("utf-8")) % PARTITION_COUNT


# Pure function: stamps each event with its partition and per-partition offset.
def assign_partitions(events):
    offsets = Counter()
    for ev in events:
        p = partition_for(ev["card_id"], ev["sequence_number"])
        ev["_partition"] = p
        ev["_offset"] = offsets[p]
        offsets[p] += 1
    return events


# Pure function: arrival lag (ingestion_time - event_time) in seconds.
def lag_seconds(ev):
    return seconds_between(parse_iso(ev["event_time"]), parse_iso(ev["ingestion_time"]))


# Pure function: buckets lag into the bands the simulator produces.
def lag_band(lag):
    if lag < 1:
        return "< 1 s (on time)"
    if lag < 30:
        return "1-30 s"
    if lag < 300:
        return "30 s - 5 min (out of order)"
    return "> 5 min (late)"


# Pure function: summarises ingestion for the Event Hubs view.
def summarise(events, tail_seconds=180):
    per_partition = Counter(ev["_partition"] for ev in events)
    per_second = Counter(iso_s(floor_second(parse_iso(ev["ingestion_time"]))) for ev in events)
    bands = Counter(lag_band(lag_seconds(ev)) for ev in events)
    cards_per_partition = {p: len({e["card_id"] for e in events if e["_partition"] == p}) for p in range(PARTITION_COUNT)}
    seconds = sorted(per_second)[-tail_seconds:]
    total = len(events) or 1
    return {
        "config": HUB_CONFIG,
        "total": len(events),
        "partitions": [
            {"partition": p, "events": per_partition[p], "share": per_partition[p] / total,
             "cards": cards_per_partition[p]}
            for p in range(PARTITION_COUNT)
        ],
        "throughput": [{"t": s, "events": per_second[s]} for s in seconds],
        "peak_eps": max(per_second.values(), default=0),
        "lag_bands": [{"band": b, "events": bands[b]} for b in
                      ["< 1 s (on time)", "1-30 s", "30 s - 5 min (out of order)", "> 5 min (late)"]],
        "duplicates": sum(1 for ev in events if ev["is_duplicate"]),
    }
