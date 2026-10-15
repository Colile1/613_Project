# build_architecture.py : draws docs/diagrams/architecture.svg (UML-style component diagram)
# Layout rules: tiers top to bottom in flow order, one column per lane so every
# connector is a straight vertical drop, one edge to a group instead of N edges,
# and cross-cutting operations drawn as a band. Run: python docs/diagrams/build_architecture.py

from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).with_name("architecture.svg")
COL_X, COL_W, GAP, LEFT = 150, 230, 30, 150
W = LEFT + 4 * COL_W + 3 * GAP + 40
FONT = "Arial, Helvetica, sans-serif"
parts, ports = [], {}


# Pure function: x of a column's left edge.
def cx(col):
    return LEFT + col * (COL_W + GAP)


# Pure function: rough text width check (Arial ~0.55 em per character).
def fits(text, size, width):
    return len(text) * size * 0.55 <= width - 16


# Draws a component box (or cylinder) and records its top/bottom ports.
def node(key, col, y, h, label, subs=(), span=1, shape="box", accent=False):
    x, w = cx(col), COL_W * span + GAP * (span - 1)
    assert fits(label, 13, w), label
    for s in subs:
        assert fits(s, 10.5, w), s
    fill = "#eef2fb" if accent else "#ffffff"
    if shape == "cylinder":
        parts.append(f'<path d="M{x},{y + 8} v{h - 16} a{w / 2},8 0 0 0 {w},0 v{-(h - 16)}" fill="{fill}" stroke="#222" stroke-width="1.3"/>')
        parts.append(f'<ellipse cx="{x + w / 2}" cy="{y + 8}" rx="{w / 2}" ry="8" fill="{fill}" stroke="#222" stroke-width="1.3"/>')
        top = y + 40
    else:
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{fill}" stroke="#222" stroke-width="1.3"/>')
        parts.append(f'<text x="{x + w - 10}" y="{y + 14}" font-size="9" text-anchor="end" fill="#666" font-family="{FONT}">\u00abcomponent\u00bb</text>')
        top = y + 30
    parts.append(f'<text x="{x + w / 2}" y="{top}" font-size="13" font-weight="bold" text-anchor="middle" font-family="{FONT}">{escape(label)}</text>')
    for i, s in enumerate(subs):
        parts.append(f'<text x="{x + w / 2}" y="{top + 17 + i * 14}" font-size="10.5" fill="#555" text-anchor="middle" font-family="{FONT}">{escape(s)}</text>')
    ports[key] = {"x": x, "w": w, "top": y, "bottom": y + h}


# Draws a dashed container (UML package-like) and records it as an edge endpoint.
def group(key, x, y, w, h, title, title_at="top"):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="none" stroke="#444" stroke-dasharray="6 4" stroke-width="1.2"/>')
    ty = y + 16 if title_at == "top" else y + h - 8
    parts.append(f'<text x="{x + 10}" y="{ty}" font-size="11" font-weight="bold" fill="#333" font-family="{FONT}">{escape(title)}</text>')
    ports[key] = {"x": x, "w": w, "top": y, "bottom": y + h}


# Draws a vertical connector at x from the bottom of one item to the top of another.
def drop(src, dst, x, label=None, dashed=False):
    y1, y2 = ports[src]["bottom"], ports[dst]["top"]
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    parts.append(f'<line x1="{x}" y1="{y1}" x2="{x}" y2="{y2 - 2}" stroke="#222" stroke-width="1.4" marker-end="url(#arrow)"{dash}/>')
    if label:
        parts.append(f'<text x="{x + 8}" y="{y1 + 20}" font-size="10" fill="#333" font-family="{FONT}">{escape(label)}</text>')


# Draws a horizontal connector between two boxes in the same tier.
def across(src, dst, y, label):
    x1, x2 = ports[src]["x"] + ports[src]["w"], ports[dst]["x"]
    parts.append(f'<line x1="{x1}" y1="{y}" x2="{x2 - 2}" y2="{y}" stroke="#222" stroke-width="1.4" marker-end="url(#arrow)"/>')
    parts.append(f'<text x="{(x1 + x2) / 2}" y="{y - 6}" font-size="10" text-anchor="middle" fill="#333" font-family="{FONT}">{escape(label)}</text>')


# Writes a tier name in the left margin.
def tier(name, y):
    parts.append(f'<text x="24" y="{y}" font-size="11" font-weight="bold" fill="#666" letter-spacing="1" font-family="{FONT}">{escape(name.upper())}</text>')


def build():
    mid = lambda key, frac=0.5: ports[key]["x"] + ports[key]["w"] * frac
    tier("Source", 70)
    node("sim", 0, 30, 78, "Event simulator", ["producer.py \u00b7 10 events/s, 5x bursts", "duplicates \u00b7 late \u00b7 malformed"])
    node("ref", 2, 30, 78, "card_metadata.json", ["5 000 cards \u00b7 tier \u00b7 credit limit"])
    tier("Ingestion", 190)
    node("eh", 0, 150, 78, "Azure Event Hubs", ["hub transactions \u00b7 4 partitions", "partition key card_id"], accent=True)
    node("blob", 2, 150, 78, "Azure Blob Storage", ["container reference-data"])
    drop("sim", "eh", mid("sim"), "AMQP")
    drop("ref", "blob", mid("ref"), "upload")
    tier("Processing", 330)
    group("asa", cx(0) - 12, 268, W - LEFT - 28, 128, "Azure Stream Analytics \u00b7 fraud-pipeline-asa \u00b7 TIMESTAMP BY event_time \u00b7 late 2 min, out-of-order 30 s")
    node("q1", 0, 296, 86, "Q1 Dead-letter filter", ["missing id, card or category", "or amount \u2264 0"])
    node("q23", 1, 296, 86, "Q2-Q3 Windows", ["tumbling 1 min per card", "hopping 5 min per category"])
    node("q6", 2, 296, 86, "Q6 Reference join", ["card tier, credit limit", "credit_flag NEAR_LIMIT"])
    node("q45", 3, 296, 86, "Q4-Q5 Fraud rules", ["velocity: sliding 5 min", "amount > 3x category average"], accent=True)
    drop("eh", "asa", mid("eh"), "consumer group stream-analytics")
    drop("blob", "q6", mid("blob"), "reference input", dashed=True)
    tier("Storage", 490)
    group("cosmos", cx(0) - 12, 430, W - LEFT - 28, 130, "Azure Cosmos DB (NoSQL) · fraud_pipeline", title_at="bottom")
    node("dl", 0, 444, 86, "dead_letter", ["key /ingestion_date · no TTL", "400 RU/s"], shape="cylinder")
    node("agg", 1, 444, 86, "aggregates", ["key /card_id · TTL 7 days · 400 RU/s"], span=2, shape="cylinder")
    node("alerts", 3, 444, 86, "fraud_alerts", ["key /card_id · TTL 30 days", "400 RU/s"], shape="cylinder")
    drop("q1", "dl", mid("q1"))
    drop("q23", "agg", mid("q23"))
    drop("q6", "agg", mid("q6"))
    drop("q45", "alerts", mid("q45"))
    tier("Reporting", 638)
    node("pbi", 1, 598, 78, "Power BI report", ["live operations \u00b7 fraud trends", "pipeline health \u00b7 card drill-through"], span=2)
    node("analyst", 3, 598, 78, "Fraud analyst", ["\u00abactor\u00bb triages red-flagged cards"])
    drop("cosmos", "pbi", mid("pbi"), "Azure Cosmos DB connector")
    across("pbi", "analyst", 637, "alerts")
    tier("Operations", 734)
    bx, bw = cx(0) - 12, W - LEFT - 28
    parts.append(f'<rect x="{bx}" y="{700}" width="{bw}" height="62" rx="6" fill="#f4f4f4" stroke="#999"/>')
    items = ["Azure Monitor: Event Hubs throughput, ASA watermark delay", "Budget alerts at $20 / $50 / $80",
             "Control Centre UI: local ASA mirror, producer runner, live Cosmos reader"]
    parts.append(f'<text x="{bx + 12}" y="{720}" font-size="11" font-weight="bold" fill="#333" font-family="{FONT}">Observability and cost control (applies to every component above)</text>')
    parts.append(f'<text x="{bx + 12}" y="{742}" font-size="10.5" fill="#444" font-family="{FONT}">{escape("   \u00b7   ".join(items))}</text>')


def main():
    build()
    h = 810
    caption = ("Figure 1: Card transactions flow from the simulator through Event Hubs, partitioned by card_id, into one "
               "Stream Analytics job. Query 1 routes malformed events to dead_letter;")
    caption2 = "the other five queries write windows, enriched transactions and fraud alerts to Cosmos DB, which the Power BI report reads."
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}">',
           '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
           '<path d="M0,0 L10,5 L0,10 z" fill="#222"/></marker></defs>',
           f'<rect width="{W}" height="{h}" fill="#ffffff"/>', *parts,
           f'<text x="24" y="{h - 26}" font-size="11.5" font-style="italic" fill="#222" font-family="{FONT}">{escape(caption)}</text>',
           f'<text x="24" y="{h - 10}" font-size="11.5" font-style="italic" fill="#222" font-family="{FONT}">{escape(caption2)}</text>',
           "</svg>"]
    OUT.write_text("\n".join(svg), encoding="utf-8")
    print("Written:", OUT)


if __name__ == "__main__":
    main()