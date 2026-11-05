# Texts and languages (`src/i18n/`)

Almost every text the player sees lives in this folder, in Japanese and in English (the rest is listed under "Not here
yet", at the end). Japanese is the master. English may be missing for any text: the build still passes, and that text
is shown in Japanese in English mode.

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
2. Write the English under the same key in the `.en.ts`, if you have it. In a screen's files, a key in `.en.ts` that
   `.ja.ts` does not have (a typo) is a type error; a key left out is not. The data records' files are keyed by
   record id, `Record<string, …>` like the missions, so there the compiler does not check the ids.
3. Read it with `ui().<screen>.<key>`.

A new screen gets a new pair of files, added to `ja.ts` and `en.ts`. A text with a value is a function in both files
(`missionNumber: (n: number) => …`). A word that depends on a value belongs in the text, not in the code around it.

## Missing English

With `#debug` in the address, the console lists every text that has no English yet
(`[i18n] en: not translated (shown in Japanese)`).

## Not here yet

Some texts are still written in the code, because the code builds them from other texts or picks them by a value: the
stamp book's groups and titles (`data/stamps.ts`), the quiz question templates (`state/quiz.ts`), the surface notes
(`data/surfaces.ts`), the rally names and tracks (`state/rally.ts`, `data/rallyTracks.ts`), the time bar's words
(`TimeBar.tsx`), the rock groups (`data/rockCollection.ts`), the rocks' composition labels (`data/rockSamples.ts`) and
the compass words of the Apollo 17 book (`HistoricBook.tsx`). Until they move, the code picks the language itself: with
`t('日本語', 'English')` from `lang.ts`, or, in the quiz, through the question's `en` part.

Outside on purpose: words painted into textures (the ship's name on the hull is read from the English file), the
language picker and the loading screen, which show both languages at once, the language button, which names the other
language, and developer pages such as `#terrain-lab`.
