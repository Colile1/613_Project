# timeutil.py : time helpers shared by the ETL stages
# Pure functions only: parse, floor and format UTC timestamps.

from datetime import datetime, timezone, timedelta


# Pure function: parses the simulator's ISO8601 "...Z" string to an aware datetime.
def parse_iso(text):
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)


# Pure function: formats a window boundary (whole seconds) as ISO8601.
def iso_s(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# Pure function: floors a datetime to the start of its minute.
def floor_minute(dt):
    return dt.replace(second=0, microsecond=0)


# Pure function: floors a datetime to the start of its second.
def floor_second(dt):
    return dt.replace(microsecond=0)


# Pure function: seconds between two datetimes (b - a).
def seconds_between(a, b):
    return (b - a).total_seconds()


MINUTE = timedelta(minutes=1)
