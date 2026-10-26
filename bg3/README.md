# The Wayfarer's Lexicon

An English → Catalan fantasy vocabulary flashcard app for a B2 reader. Open **index.html** directly in a modern browser. No server, account, installation, build step, or network connection is needed to study. The delivered HTML embeds its styles, JavaScript, and complete deck.

## Source status

The original XML is now available at `data/english.xml` and has been analysed: **232,878 localisation entries, 173 matched vocabulary cards**. The app opens with genuine game contexts and Catalan translations of all 173 selected sentences. The contexts have been reviewed for the intended word meaning and retain their exact XML `contentuid`. Catalan translations are original explanatory translations, not official localisation.

To regenerate the source-based deck, run:

```sh
python3 scripts/import_xml.py data/english.xml
```

This validates the XML, retains its original bytes in `data/english.xml` (or copies them there if another input path is supplied), records a SHA-256 checksum, extracts suitable sentences with their `contentuid`, writes `data/contexts.json`, and rebuilds `index.html`. Reviewed choices and Catalan translations from `data/curated_contexts.json` are applied only when the source ID and English text match an actual XML entry. Reload after rebuilding: a changed embedded deck activates the updated contexts and translations while preserving review progress. If you choose the practice deck afterwards, that choice is retained across reloads.

Alternatively, choose **Source → Open your English XML** in the app. Browser import saves selected contexts on the device and reuses bundled reviewed translations only when their source ID and English text match exactly. New sentences are not automatically translated. Browser import does **not** copy the original file to the project directory. Only matched words with a useful context are included. The app matches a curated glossary; it does not claim to identify every unknown word in the corpus.

## Study

- The front shows an English word and a sentence. Reveal the back for its Catalan meaning and a short English definition.
- All 173 bundled game contexts and the practice examples include a full Catalan sentence translation on the back. A new XML sentence without a reviewed translation remains in English and is labelled accordingly.
- **Again** repeats after up to three intervening cards; **Hard** returns tomorrow; **Got it** starts at three days and doubles the previous interval up to 60 days; **Familiar** returns in 30 days. “I know this” marks a word familiar immediately.
- Space flips the card; 1–4 rate a revealed card; U undoes the previous review. Controls work with mouse, touch, and keyboard.
- Save words with ☆. Search English and Catalan in **Wordbook**. Select a word for both sides and a direct study shortcut.
- Progress uses browser local storage. Export and restore JSON backups in **Source**. Browsers may handle local-file storage differently; the app reports when storage fails.
- Pronunciation uses the device's speech engine. An installed English voice may be required for offline playback.

## Vocabulary selection

The list favours English roots that are unlike Catalan/Spanish, medieval speech, weapons, supernatural creatures, and specialised senses. It excludes obvious cognates. For example, it includes `thrall`, `scabbard`, `beguile`, `lest`, `stave off`, and `portcullis`, rather than `necromancer`, `infernal`, or `ritual`.

The Catalan translations are explanatory, not official D&D localisation. `warlock`, `wizard`, and `sorcerer` have different sources of magical power, so their translations include short explanations. Some common English words are retained for uncommon senses, such as `hide` (animal skin), `keep` (castle building), and `ward` (magical protection).

Automatic context matching chooses short sentences, skips placeholders and many technical strings, and filters ambiguous senses. The bundled contexts have been reviewed: for example, `keep` uses the castle meaning, `gauntlet` uses the armoured glove meaning, and `ere` uses the archaic “before” meaning rather than dialectal `'ere` (“here”). `Barrow` uses “carretó” because the actual game entry refers to a cart, not a burial mound. Localisation XML also contains books, item descriptions, and interface text. The app labels excerpts “BG3 XML”, not as a claim about who said them. Game text may include spoilers.

## Edit and rebuild

- `data/vocabulary.tsv`: editable glossary, examples, translations, and word forms.
- `data/curated_contexts.json`: reviewed source sentences and Catalan translations, keyed by vocabulary ID.
- `data/contexts.json`: generated matched deck and source metadata.
- `template.html`, `app.css`, `core.js`, `app.js`: app sources.
- `scripts/build.py`: builds the standalone `index.html` using only Python's standard library.
- `scripts/import_xml.py`: safe source copy and context extraction.
- `tests/`: extraction and review scheduling checks, including synthetic XML clearly identified as test data.

```sh
python3 scripts/build.py
node --test tests/core.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

No requests are made to external services by the app. The full XML is excluded from backups, which contain only progress, saved words, source metadata, and selected context lines.
