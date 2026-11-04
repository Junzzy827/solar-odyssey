# Texts and languages (`src/i18n/`)

Every text the player sees lives in this folder, in Japanese and in English. Japanese is the master. English may be
missing for any text: the build still passes, and that text is shown in Japanese in English mode.

## Files

- **One pair of files per screen or topic**: `navPanel.ja.ts` and `navPanel.en.ts`, with the same keys. A screen's
  files are named after its source file (`NavPanel.tsx` → `navPanel`); the texts of data records after the data
  (`bodies`, `ships`, `probes`, `pois` …).
- **`ja.ts`** gathers the Japanese files into one dictionary, `ja`, and holds the story mode's short texts itself.
  **`en.ts`** does the same for English; it is typed `Translation<typeof ja>`.
- **`missions.ja.ts` / `missions.en.ts`**: the missions and chapters, read with `missionText(id)` and `chapterText(id)`.
- **`facts.ja.ts` / `facts.en.ts`** (`FACTS`, `FACTS_EN`) and **`sfFacts.ja.ts` / `sfFacts.en.ts`** (the SF objects'
  tables, spread into `FACTS`): the ship's log, read with `factsFor(id)` in `data/facts.ts`.
- `index.ts`: `ui()` and the other readers · `translation.ts`: the shape of a translation and how its gaps are filled
  · `lang.ts`: the current language and `useLang()`.

## Reading a text

```ts
ui().navPanel.sun                 // a text
ui().missionNumber(k + 1)         // a text with a value: a function, in both languages
ui().bodies[planet.id].name       // a data record's text, by the record's id
missionText(m.id).title           // a mission's text
```

- `ui()` looks up the current language each time it is called. Call it where the text is shown, never once when a
  file loads: a text made at load time keeps the first language.
- A component that shows texts calls `useLang()` at its top, so it draws again when the language changes.
- `uiJa` and `uiEn` are the dictionaries of one language, for text that is made in both languages at once (the quiz
  questions built from planet data) or that is always in one (the ship's name painted on the hull is English).

## Data records

A record keeps its numbers and ids; its texts are here, keyed by its id, the way missions are. The record's type is
split in two in its data file: `Planet` holds the structure, `PlanetText` right after it holds the text fields (with
their comments), and `bodies.ja.ts` is a `Record<string, PlanetText | MoonText>`. The Sun, the planets and the moons
share one file, keyed by body id.

## Adding a text

1. Write the Japanese in the screen's `.ja.ts`, under a key that says what the text is.
2. Write the English under the same key in the `.en.ts`, if you have it. A key in `.en.ts` that `.ja.ts` does not have
   (a typo) is a type error; a key left out is not.
3. Read it with `ui().<screen>.<key>`.

A new screen gets a new pair of files, added to `ja.ts` and `en.ts`. A text with a value is a function in both files
(`missionNumber: (n: number) => …`). A word that depends on a value belongs in the text, not in the code around it.

## Missing English

With `#debug` in the address, the console lists every text that has no English yet
(`[i18n] en: not translated (shown in Japanese)`).

## Not here yet

Some texts are still written in the code, because the code builds them from other texts: the stamp book's groups and
titles (`data/stamps.ts`), the quiz question templates (`state/quiz.ts`), the surface notes (`data/surfaces.ts`), the
rally names and tracks (`state/rally.ts`, `data/rallyTracks.ts`), the time bar's words (`TimeBar.tsx`) and the rock
groups (`data/rockCollection.ts`). `t('日本語', 'English')` in `lang.ts` serves them until they move.
