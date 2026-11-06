// ほかの言語の辞書の形と、足りない文言を日本語でうめるしくみ。
// もとは日本語の辞書。訳は同じキーだけ書けて（ないキーやつづりの違うキーはエラー）、書かなかったキーは日本語で出る。
// だから日本語だけ先に足しても、ビルドは通る

/** 日本語の辞書 T に合わせた訳の形：キーは T と同じ。どのキーも省ける */
export type Translation<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly Translation<U>[]
    : T extends object
      ? { [K in keyof T]?: Translation<T[K]> }
      : T

const merge = (ja: unknown, part: unknown): unknown => {
  if (part === undefined) return ja
  if (Array.isArray(ja)) return ja.map((x, i) => merge(x, (part as readonly unknown[])[i]))
  if (typeof ja === 'object' && ja !== null) {
    const p = part as Record<string, unknown>
    return Object.fromEntries(Object.entries(ja).map(([k, v]) => [k, merge(v, p[k])]))
  }
  return part
}

/** 訳の足りないところを日本語でうめた辞書（配列は番号ごと、オブジェクトはキーごと） */
export const fill = <T>(ja: T, part: Translation<NoInfer<T>>): T => merge(ja, part) as T

/** 訳にない文言の場所（'framing.fast' など）。そこは日本語で出る */
export const untranslated = (ja: unknown, part: unknown, at = ''): string[] => {
  if (Array.isArray(ja)) {
    const p = part as readonly unknown[] | undefined
    return ja.flatMap((x, i) => untranslated(x, p?.[i], `${at}[${i}]`))
  }
  if (typeof ja === 'object' && ja !== null) {
    const p = part as Record<string, unknown> | undefined
    return Object.entries(ja).flatMap(([k, v]) => untranslated(v, p?.[k], at ? `${at}.${k}` : k))
  }
  return part === undefined ? [at] : []
}

// id で引く表（天体・船・ミッションなど）：ない id を引いても遊びは止めない。コンソールにエラーを一度出して、
// 文言の代わりに id を見せる。わざと id がないこともある表（岩のグループ名、組成の語、着陸と空の説明）には使わない
const BY_ID = new WeakSet<object>()

/** id で引く表の印（日本語の .ja.ts で付ける） */
export const byId = <T extends object>(texts: T): T => {
  BY_ID.add(texts)
  return texts
}

/** ない id の代わりの文言：表のほかの文言と同じ形で、文字のところは id */
const stand = (sample: unknown, id: string): unknown => {
  if (typeof sample === 'string') return id
  if (typeof sample === 'function') return () => id
  if (Array.isArray(sample)) return sample.map((x) => stand(x, id))
  if (typeof sample === 'object' && sample !== null) return Object.fromEntries(Object.entries(sample).map(([k, v]) => [k, stand(v, id)]))
  return sample
}

// JSON.stringify・Promise・React が、ふつうのオブジェクトにあるかどうか調べる名前（id ではない）
const PROTOCOL = new Set(['toJSON', 'then', '$$typeof'])

const guard = (table: object, sample: unknown, at: string, lang: string): object => {
  const made = new Map<string, unknown>()
  return new Proxy(table, {
    get(t, k, r) {
      if (typeof k !== 'string' || k in t || PROTOCOL.has(k)) return Reflect.get(t, k, r)
      if (!made.has(k)) {
        console.error(`ERROR [i18n] ${lang}: no text for ${at}["${k}"] (its id is shown instead)`)
        made.set(k, stand(sample, k))
      }
      return made.get(k)
    },
  })
}

/** 辞書の中の、byId の印がある表を見張る（ja は日本語の辞書：印と、代わりの形の手本） */
export const guardIds = <T>(dict: T, ja: T, lang: string, at = ''): T => {
  if (typeof ja !== 'object' || ja === null || Array.isArray(ja)) return dict
  if (BY_ID.has(ja)) return guard(dict as object, Object.values(ja)[0], at, lang) as T
  let out: Record<string, unknown> | undefined
  for (const [k, v] of Object.entries(ja)) {
    const d = (dict as Record<string, unknown>)[k]
    const g = guardIds(d, v, lang, at ? `${at}.${k}` : k)
    if (g !== d) (out ??= { ...(dict as Record<string, unknown>) })[k] = g
  }
  return (out ?? dict) as T
}
