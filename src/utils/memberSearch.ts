export type MemberSearchValue = string | number | null | undefined

const normalizeSearchToken = (value: MemberSearchValue) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-Hant')
    .replace(/[\s#＃()（）｜|/_-]+/g, '')

export const matchesMemberSearch = (
  query: MemberSearchValue,
  values: MemberSearchValue[]
) => {
  const tokens = String(query ?? '')
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .map(normalizeSearchToken)
    .filter(Boolean)

  if (tokens.length === 0) return true

  const normalizedValues = values
    .map(normalizeSearchToken)
    .filter(Boolean)

  return tokens.every((token) =>
    normalizedValues.some((value) => value.includes(token))
  )
}
