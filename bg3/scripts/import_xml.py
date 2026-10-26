#!/usr/bin/env python3
"""Copy a user-supplied BG3 XML verbatim, extract traceable context, rebuild HTML.

Usage: python3 scripts/import_xml.py /path/to/english.xml
No network, external dependencies, or automatic translation services.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET

from build import ROOT, build, load_cards


def clean(text):
    for _ in range(2):
        text = html.unescape(text)
    text = re.sub(r'<br\s*/?\s*>', ' ', text, flags=re.I)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', text)).strip().strip('*').strip()


def meaningful(word, line):
    s = line.lower().replace('’', "'")
    rules = {
        'keep': r'\b(?:the|a|this|that|our|their|his|her) (?:(?:old|ancient|ruined|fortified|stone|abandoned|inner) )?keep\b',
        'hide': r"\b(?:thick|tough|leathery|scaly|beast's|animal's|dragon's) hide\b|\bhide (?:armour|armor)\b",
        'brood': r'\b(?:her|its|their|the|a|our) brood\b|\bbrood of\b',
        'quiver': r'\b(?:my|your|his|her|the|a|empty|full) quiver\b|\bquiver of\b',
    }
    if word in rules and not re.search(rules[word], s):
        return False
    if word == 'keep' and re.search(r'\bkeep (?:you|me|us|them|it|him|her|your|my|our|their)\b', s):
        return False
    if word == 'barrow' and re.search(r'\b(?:wheelbarrow|barrow of|barrow full)\b', s):
        return False
    if word == 'beholder' and 'eye of the beholder' in s:
        return False
    if word == 'spell' and re.search(r'\bspell (?:it|your|my|the word|his name|her name|out)\b', s):
        return False
    if word == 'bog' and re.search(r'\bbog[ -](?:roll|paper)\b', s):
        return False
    if word == 'cleave' and 'cleave soul to body' in s:
        return False
    if word == 'ere' and re.search(r"['’]ere\b", s):
        return False
    if word == 'gauntlet' and 'gauntlet of shar' in s:
        return False
    if word == 'loathe' and re.search(r'\b(?:am|was|is|are|were|be) loathe to\b', s):
        return False
    if word == 'rend' and re.search(r'\brent\b', s) and not re.search(r'\brent (?:asunder|apart|the|his|her|their|my)\b', s):
        return False
    return True


def extract(path, cards, curated=None):
    patterns = {c['id']: re.compile(r'\b(?:' + '|'.join(re.escape(f) for f in sorted(c['forms'], key=len, reverse=True)) + r')\b', re.I) for c in cards}
    index = {}
    for c in cards:
        for form in c['forms']:
            first = re.search(r"[a-z]+(?:'[a-z]+)?", form.lower())
            if first:
                index.setdefault(first[0], {})[c['id']] = c
    result = {}
    wanted = {}
    verified = {}
    for card_id, context in (curated or {}).items():
        if card_id in patterns:
            wanted.setdefault(context['sourceId'], []).append((card_id, context))
    entries = 0
    # Reject entity declarations before feeding an untrusted XML into the parser.
    with path.open('rb') as f:
        tail = b''
        while chunk := f.read(1024 * 1024):
            scan = tail + chunk
            if re.search(br'<!DOCTYPE|<!ENTITY', scan, re.I):
                raise ValueError('DTD/entity declarations are unsupported. Use the original localisation export.')
            tail = scan[-64:]
    for event, element in ET.iterparse(path, events=('end',)):
        if element.tag.split('}')[-1] != 'content':
            continue
        entries += 1
        text = clean(''.join(element.itertext()))
        source_id = element.get('contentuid') or element.get('id') or ''
        for card_id, context in wanted.get(source_id, []):
            if context['text'] in text and patterns[card_id].search(context['text']):
                verified[card_id] = dict(context)
        if re.search(r'\[[^\]]*\]|\{[^}]*\}|\\[nrt]|https?://', text):
            element.clear()
            continue
        for line in re.findall(r'''[^.!?]+(?:[.!?]+["'”’]*|$)''', text):
            line = line.strip()
            words = re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", line)
            if not 6 <= len(words) <= 38 or re.search(r'\b(?:UUID|TODO|DEBUG|tooltip|deprecated|placeholder|PLEASE RECORD|DO NOT RECORD)\b', line, re.I):
                continue
            if re.search(r'^[^A-Za-z“"\'\*]*\d', line):
                continue
            candidates = {}
            for token in re.findall(r"[a-z]+(?:'[a-z]+)?", line.lower().replace('’', "'")):
                candidates.update(index.get(token, {}))
            for card_id, card in candidates.items():
                matches = patterns[card_id].findall(line)
                if not matches or not meaningful(card['word'], line):
                    continue
                score = abs(len(line.split()) - 16) + (12 if re.search(r'\d', line) else 0) + (0 if re.search(r'''[.!?]["'”’]*$''', line) else 8) + (6 if len(matches) > 2 else 0)
                old = result.get(card_id)
                count = old['count'] + 1 if old else 1
                if old is None or score < old['score']:
                    result[card_id] = {'text': line, 'sourceId': source_id, 'score': score, 'count': count}
                else:
                    old['count'] = count
        element.clear()
    if not entries:
        raise ValueError('No <content> entries found in XML.')
    if not result and not verified:
        raise ValueError('No readable sentences matched this glossary. Previous source has been kept.')
    for card_id, context in verified.items():
        context['count'] = result.get(card_id, {}).get('count', 1)
        result[card_id] = context
    return entries, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('xml', type=Path)
    args = parser.parse_args()
    source = args.xml.expanduser().resolve()
    if not source.is_file():
        parser.error(f'File not found: {source}')
    # Validate and extract before replacing the working copy or context data.
    curated_path = ROOT / 'data/curated_contexts.json'
    curated = json.loads(curated_path.read_text()) if curated_path.exists() else {}
    entries, contexts = extract(source, load_cards(), curated)
    target = ROOT / 'data/english.xml'
    digest = hashlib.sha256()
    with source.open('rb') as f:
        while chunk := f.read(1024 * 1024):
            digest.update(chunk)
    payload = {'corpus': {'name': source.name, 'entries': entries, 'importedAt': datetime.now(timezone.utc).isoformat(), 'hash': digest.hexdigest()}, 'contexts': contexts}
    if source != target.resolve():
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
            temp_path = Path(tmp.name)
        try:
            shutil.copyfile(source, temp_path)
            temp_path.replace(target)
        finally:
            temp_path.unlink(missing_ok=True)
    (ROOT / 'data/contexts.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    build()
    print(f'Original XML at {target}. SHA-256: {digest.hexdigest()}')
    print(f'Matched {len(contexts)} words in {entries:,} entries. Context selection is heuristic; inspect ambiguous words.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, ET.ParseError, OSError) as error:
        print(f'Import failed: {error}', file=sys.stderr)
        sys.exit(1)
