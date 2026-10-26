"""Synthetic fixture text below is not quoted from the game."""
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import hashlib

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build import load_cards
from import_xml import extract, clean


class ImportTests(unittest.TestCase):
    def extract_text(self, text):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'synthetic-fixture.xml'
            p.write_text(text)
            return extract(p, load_cards())

    def test_real_context_and_encoded_markup(self):
        n,result=self.extract_text('''<contentList>
<content contentuid="synthetic_1">An &lt;LSTag Type="Spell"&gt;eldritch&lt;/LSTag&gt; light flickered beneath the locked door.</content>
<content contentuid="synthetic_2">The villagers fled into the keep before nightfall.</content>
<content contentuid="synthetic_3">We should keep your friends safe from harm.</content>
</contentList>''')
        self.assertEqual(n,3)
        self.assertEqual(result['eldritch']['sourceId'],'synthetic_1')
        self.assertEqual(result['eldritch']['text'],'An eldritch light flickered beneath the locked door.')
        self.assertEqual(result['keep']['sourceId'],'synthetic_2')

    def test_broken_or_unsafe_xml_fails(self):
        with self.assertRaises(ET.ParseError):
            self.extract_text('<contentList><content>Broken XML')
        with self.assertRaises(ValueError):
            self.extract_text('<!DOCTYPE a [<!ENTITY e "bad">]><contentList/>')
        with self.assertRaises(ValueError):
            self.extract_text('<contentList><content>Eldritch Blast</content></contentList>')

    def test_glossary_examples_contain_target_forms_and_avoid_cognates(self):
        cards=load_cards()
        self.assertGreaterEqual(len(cards),150)
        self.assertEqual(len(cards),len({c['id'] for c in cards}))
        for c in cards:
            pattern=r'\b(?:'+'|'.join(re.escape(f) for f in c['forms'])+r')\b'
            self.assertRegex(c['example'].lower(),pattern)
            self.assertTrue(c['exampleCa'].strip())
        self.assertFalse({'malice','anguish','conjure','halberd','riposte','pyre'} & {c['word'] for c in cards})

    def test_standalone_has_embedded_deck_and_no_external_assets(self):
        html=(ROOT/'index.html').read_text()
        payload=re.search(r'<script id="deck-data" type="application/json">(.*?)</script>',html,re.S)[1]
        self.assertEqual(len(json.loads(payload)['cards']),len(load_cards()))
        self.assertNotRegex(html,r'<(?:script|link|img)[^>]+(?:src|href)="https?://')
        self.assertNotIn('/* APP_JS */',html)

    def test_command_copies_exact_bytes_and_builds_matched_deck(self):
        with tempfile.TemporaryDirectory() as folder:
            project=Path(folder)/'project'
            (project/'data').mkdir(parents=True)
            shutil.copytree(ROOT/'scripts',project/'scripts',ignore=shutil.ignore_patterns('__pycache__'))
            shutil.copyfile(ROOT/'data/vocabulary.tsv',project/'data/vocabulary.tsv')
            for name in ['template.html','app.css','app.js','core.js']:
                shutil.copyfile(ROOT/name,project/name)
            fixture=Path(folder)/'synthetic-input.xml'
            original=b'<contentList>\r\n<content contentuid="synthetic-copy">An eldritch light flickered beneath the locked door.</content>\r\n</contentList>'
            fixture.write_bytes(original)
            completed=subprocess.run([sys.executable,str(project/'scripts/import_xml.py'),str(fixture)],capture_output=True,text=True)
            self.assertEqual(completed.returncode,0,completed.stderr)
            self.assertEqual((project/'data/english.xml').read_bytes(),original)
            contexts=json.loads((project/'data/contexts.json').read_text())
            self.assertIn('eldritch',contexts['contexts'])
            self.assertEqual(contexts['contexts']['eldritch']['sourceId'],'synthetic-copy')
            self.assertIn('synthetic-copy',(project/'index.html').read_text())
            fixture.write_text('<broken>')
            failed=subprocess.run([sys.executable,str(project/'scripts/import_xml.py'),str(fixture)],capture_output=True,text=True)
            self.assertNotEqual(failed.returncode,0)
            self.assertEqual((project/'data/english.xml').read_bytes(),original)

    def test_reviewed_translation_is_not_applied_to_changed_source(self):
        text='A bright eldritch light shone beneath the locked door.'
        reviewed={'eldritch':{'sourceId':'test-id','text':text,'catalan':'Una llum sobrenatural brillant lluïa sota la porta tancada.'}}
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'test.xml'
            p.write_text(f'<contentList><content contentuid="test-id">{text}</content></contentList>')
            _,matched=extract(p,load_cards(),reviewed)
            self.assertEqual(matched['eldritch']['catalan'],reviewed['eldritch']['catalan'])
            p.write_text('<contentList><content contentuid="test-id">An eldritch voice whispered softly from beyond the locked door.</content></contentList>')
            _,changed=extract(p,load_cards(),reviewed)
            self.assertNotIn('catalan',changed['eldritch'])

    @unittest.skipUnless((ROOT/'data/english.xml').exists(),'Original corpus not available')
    def test_all_curated_contexts_are_verbatim_and_translated(self):
        curated=json.loads((ROOT/'data/curated_contexts.json').read_text())
        wanted={}
        for card_id,ctx in curated.items():
            wanted.setdefault(ctx['sourceId'],[]).append((card_id,ctx))
        verified=set()
        for _,el in ET.iterparse(ROOT/'data/english.xml',events=('end',)):
            if el.tag!='content':
                continue
            for card_id,ctx in wanted.get(el.get('contentuid'),[]):
                self.assertIn(ctx['text'],clean(''.join(el.itertext())),card_id)
                self.assertTrue(ctx['catalan'].strip(),card_id)
                verified.add(card_id)
            el.clear()
        self.assertEqual(verified,set(curated))
        output=json.loads((ROOT/'data/contexts.json').read_text())
        self.assertEqual(set(output['contexts']),set(curated))
        self.assertEqual(len(verified),173)
        for card_id,ctx in output['contexts'].items():
            self.assertEqual(ctx['catalan'],curated[card_id]['catalan'])


if __name__=='__main__':
    unittest.main()
