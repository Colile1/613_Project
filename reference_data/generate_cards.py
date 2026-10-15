# generate_cards.py : builds reference_data/card_metadata.json with 5 000 cards
# Keeps the original 50 hand-written cards unchanged and adds generated ones
# in the same style: South African names, tiers in the original proportions
# (about 54% Standard, 30% Gold, 16% Platinum) and the original credit-limit
# ranges per tier. Seeded, so the file is identical on every run.
#
# Why 5 000 cards: see docs/decisions/velocity_rule.md.
# Run from the project root:  python reference_data/generate_cards.py [count]   (default 5000)

import json
import random
import sys
from pathlib import Path

PATH = Path(__file__).with_name("card_metadata.json")
CARD_COUNT = 5000
ORIGINAL_COUNT = 50
SEED = 613

FIRST_NAMES = [
    "Thabo", "Lerato", "Sipho", "Nomsa", "Bongani", "Zanele", "Andile", "Precious", "Lungelo", "Ayanda",
    "Kagiso", "Palesa", "Tshepo", "Refilwe", "Katlego", "Lebogang", "Mpho", "Neo", "Karabo", "Boitumelo",
    "Sello", "Dineo", "Tumelo", "Naledi", "Kabelo", "Itumeleng", "Lindiwe", "Sibusiso", "Thandiwe", "Xolani",
    "Siphesihle", "Asanda", "Lwazi", "Unathi", "Zukisa", "Anele", "Luvuyo", "Sinazo", "Mandla", "Nandi",
    "Pieter", "Annelie", "Johan", "Marike", "Willem", "Elmarie", "Hendrik", "Ilse", "Riaan", "Sunette",
    "James", "Sarah", "Michael", "Emma", "David", "Jessica", "Daniel", "Megan", "Ryan", "Nicole",
    "Priya", "Rajesh", "Anisha", "Kevin", "Shanice", "Yusuf", "Fatima", "Ashwin", "Nadia", "Ebrahim",
    "Colile", "Tebogo", "Rethabile", "Masego", "Onalenna", "Khanyisile", "Musa", "Nokwanda", "Ziyanda", "Lutho",
]
SURNAMES = [
    "Nkosi", "Dlamini", "Mahlangu", "Khumalo", "Sithole", "Mokoena", "Ntuli", "Dube", "Mthembu", "Shabalala",
    "Molefe", "Mokgadi", "Mabaso", "Masilela", "Ramaphosa", "Modise", "Tau", "Phiri", "Motaung", "Sebego",
    "Mbeki", "Gqirana", "Ngcukaitobi", "Mxenge", "Sobukwe", "Ndamase", "Mafu", "Jola", "Qwabe", "Tshabalala",
    "van der Merwe", "Botha", "Pretorius", "du Plessis", "Nel", "Venter", "Steyn", "Coetzee", "Fourie", "Kruger",
    "Smith", "Naidoo", "Pillay", "Govender", "Reddy", "Moodley", "Patel", "Adams", "Jacobs", "Petersen",
    "Williams", "Hendricks", "Abrahams", "Daniels", "Isaacs", "Sibanda", "Moyo", "Ndlovu", "Mkhize", "Zulu",
]
# (tier, share, lowest limit, highest limit, step) - from the original 50 cards
TIERS = [("Standard", 0.54, 6000, 27000, 500), ("Gold", 0.30, 35000, 62000, 1000), ("Platinum", 0.16, 75000, 200000, 5000)]


# Pure function: one generated card row.
def make_card(rng, number):
    tier, _, low, high, step = rng.choices(TIERS, weights=[t[1] for t in TIERS])[0]
    return {
        "card_id": f"CARD-{number:04d}",
        "customer_name": f"{rng.choice(FIRST_NAMES)} {rng.choice(SURNAMES)}",
        "customer_tier": tier,
        "credit_limit_zar": rng.randrange(low, high + step, step),
    }


# Pure function: the original cards followed by generated ones up to `count`.
def build_cards(original, count=CARD_COUNT):
    rng = random.Random(SEED)
    return original[:min(count, ORIGINAL_COUNT)] + [make_card(rng, n) for n in range(ORIGINAL_COUNT + 1, count + 1)]


# Input wrapper: card count from the command line (50 - 50 000).
def get_count():
    return max(ORIGINAL_COUNT, min(int(sys.argv[1]), 50000)) if len(sys.argv) > 1 else CARD_COUNT


# Input wrapper: reads the current file.
def get_original():
    return json.loads(PATH.read_text(encoding="utf-8"))


# Output logic: writes one card per line (readable diffs, small file).
def write_cards(cards):
    lines = ",\n  ".join(json.dumps(c, ensure_ascii=False) for c in cards)
    PATH.write_text("[\n  " + lines + "\n]\n", encoding="utf-8")
    print("Cards written:", len(cards))


def main():
    write_cards(build_cards(get_original(), get_count()))


if __name__ == "__main__":
    main()