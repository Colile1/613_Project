# enrich.py : TRANSFORM stage, part 3 (reference join)
# Query step 6: joins each valid event with reference_data/card_metadata.json
# (the ASA "CardMetadata" Blob reference input) and sets credit_flag.
# On Azure the documents also carry enqueued_time / processed_time from the
# Event Hubs input; those are measured by Azure and are not simulated here.

import json
from pathlib import Path


METADATA_PATH = Path(__file__).resolve().parents[2] / "reference_data" / "card_metadata.json"


# Input wrapper: loads the card metadata reference file into a lookup by card_id.
def get_card_metadata():
    rows = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return {row["card_id"]: row for row in rows}


# Pure function: NEAR_LIMIT when the amount exceeds 80% of the credit limit.
def credit_flag(amount, limit):
    return "NEAR_LIMIT" if amount > limit * 0.8 else "NORMAL"


# Pure function: inner join of valid events with the reference lookup.
def enrich(valid, metadata, wm):
    docs = []
    for ev in valid:
        ref = metadata.get(ev["card_id"])
        if ref is None or (wm is not None and ev["_ts"] > wm):
            continue
        docs.append({
            "id": f"{ev['transaction_id']}_{ev['sequence_number']}",
            "transaction_id": ev["transaction_id"], "card_id": ev["card_id"],
            "merchant_id": ev["merchant_id"], "merchant_category": ev["merchant_category"],
            "amount": ev["amount"], "currency": ev["currency"], "event_time": ev["event_time"],
            "ingestion_time": ev["ingestion_time"], "is_duplicate": ev["is_duplicate"],
            "sequence_number": ev["sequence_number"], "customer_tier": ref["customer_tier"],
            "credit_limit_zar": ref["credit_limit_zar"], "customer_name": ref["customer_name"],
            "credit_flag": credit_flag(ev["amount"], ref["credit_limit_zar"]),
        })
    return docs
