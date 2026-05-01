"""
Transaction event schema for the fraud-monitoring pipeline.

Each event represents a single card-present or card-not-present payment.
event_time  = time the transaction occurred (event time, set by simulator)
ingestion_time = time the event was sent to Event Hubs (processing time, set at send)

The distinction matters for Stream Analytics windowing: ASA uses TIMESTAMP BY
event_time so late or out-of-order events are bucketed correctly.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Literal

MERCHANT_CATEGORIES = ["grocery", "fuel", "online", "restaurant", "travel", "atm", "pharmacy"]

CITIES = [
    {"city": "Johannesburg", "lat": -26.2041, "lng": 28.0473},
    {"city": "Cape Town",    "lat": -33.9249, "lng": 18.4241},
    {"city": "Durban",       "lat": -29.8587, "lng": 31.0218},
    {"city": "Pretoria",     "lat": -25.7479, "lng": 28.2293},
    {"city": "Port Elizabeth","lat": -33.9608, "lng": 25.6022},
    {"city": "Bloemfontein", "lat": -29.0852, "lng": 26.1596},
]


@dataclass
class Location:
    city: str
    lat: float
    lng: float

    def to_dict(self) -> dict:
        return {"city": self.city, "lat": self.lat, "lng": self.lng}


@dataclass
class TransactionEvent:
    transaction_id: str          # UUID4 — unique per transaction
    card_id: str                 # CARD-XXXX — partition key for Event Hubs
    merchant_id: str             # MERCH-XXX
    merchant_category: str       # See MERCHANT_CATEGORIES
    amount: float                # ZAR, log-normal distribution
    currency: str                # Always "ZAR" for this scenario
    location: Location
    event_time: str              # ISO8601, event time (when tx occurred)
    ingestion_time: str          # ISO8601, processing time (when sent to EH)
    is_duplicate: bool           # True if intentionally re-sent duplicate
    sequence_number: int         # Monotonic counter for ordering analysis
    # Anomaly simulation flags (not sent to real pipeline, just for audit)
    _out_of_order: bool = field(default=False, repr=False)
    _late_arrival: bool = field(default=False, repr=False)

    def to_event_hub_body(self) -> dict:
        """Return dict suitable for sending to Event Hubs (excludes private fields)."""
        return {
            "transaction_id": self.transaction_id,
            "card_id": self.card_id,
            "merchant_id": self.merchant_id,
            "merchant_category": self.merchant_category,
            "amount": round(self.amount, 2),
            "currency": self.currency,
            "location": self.location.to_dict(),
            "event_time": self.event_time,
            "ingestion_time": self.ingestion_time,
            "is_duplicate": self.is_duplicate,
            "sequence_number": self.sequence_number,
        }
