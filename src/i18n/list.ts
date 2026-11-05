// 英語で名前を並べる形：「A」「A and B」「A, B, and C」。Intl.ListFormat('en') と同じ形
// （tsconfig の lib が ES2020 で Intl.ListFormat の型がないので、ここに書く）

export function listEn(items: readonly string[]): string {
  if (items.length < 3) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
