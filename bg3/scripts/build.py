#!/usr/bin/env python3
"""Build a dependency-free index.html, usable directly through file://."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_cards():
    cards = []
    # These have close Catalan/Spanish cognates; keep them out of the study deck.
    excluded = {'conjure', 'halberd', 'riposte', 'malice', 'anguish', 'pyre'}
    with (ROOT / 'data/vocabulary.tsv').open(encoding='utf-8', newline='') as source:
        for row in csv.DictReader(source, delimiter='\t'):
            if row['word'] in excluded:
                continue
            row['id'] = row['word'].replace(' ', '-')
            row['forms'] = row['forms'].split(',')
            assert all(row.values()), f'Incomplete card: {row}'
            cards.append(row)
    assert len({c['id'] for c in cards}) == len(cards)
    return cards


def build():
    cards = load_cards()
    source_path = ROOT / 'data/contexts.json'
    imported = json.loads(source_path.read_text()) if source_path.exists() else {}
    bg1_path = ROOT / 'data/bg1_curated.json'
    bg1 = json.loads(bg1_path.read_text()) if bg1_path.exists() else []
    cards.extend(item['card'] for item in bg1)
    bg1_contexts = {item['card']['id']: item['context'] for item in bg1}
    contexts = {**imported.get('contexts', {}), **bg1_contexts}
    payload = {'cards': cards, 'contexts': contexts, 'bg1Contexts': bg1_contexts, 'corpus': imported.get('corpus')}
    if payload['corpus']:
        payload['corpus']['deckHash'] = hashlib.sha256(json.dumps(payload['contexts'], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    html = (ROOT / 'template.html').read_text()
    css = (ROOT / 'app.css').read_text()
    js = (ROOT / 'core.js').read_text() + '\n' + (ROOT / 'app.js').read_text()
    # Only replace template placeholders once. Embedded data is escaped for HTML's raw-text parser.
    html = html.replace('/* APP_CSS */', css, 1)
    html = html.replace('/* APP_JS */', js, 1)
    html = html.replace('/* DECK_DATA */', json.dumps(payload, ensure_ascii=False).replace('<', '\\u003c'), 1)
    output = ROOT / 'index.html'
    output.write_text(html, encoding='utf-8')
    print(f'Built {output}: {len(cards)} curated words, {len(payload["contexts"])} game contexts.')


if __name__ == '__main__':
    build()
