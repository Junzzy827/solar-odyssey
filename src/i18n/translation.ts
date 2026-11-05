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
