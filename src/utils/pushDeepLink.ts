export const DEFAULT_PUSH_DEEP_LINK_TARGET = '/dashboard'
export const PUSH_ENTRY_ROUTE = '/push-entry'
export const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK'

const getDefaultOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return 'https://jg-baseball.local'
}

const toSameOriginPath = (rawTarget: string, origin: string) => {
  let nextTarget = rawTarget.trim()

  if (!nextTarget) {
    return ''
  }

  if (nextTarget.startsWith('/#')) {
    nextTarget = nextTarget.slice(2)
  } else if (nextTarget.startsWith('#')) {
    nextTarget = nextTarget.slice(1)
  } else {
    try {
      const targetUrl = new URL(nextTarget, origin)
      if (targetUrl.origin !== origin) {
        return ''
      }

      nextTarget = targetUrl.hash.startsWith('#/')
        ? targetUrl.hash.slice(1)
        : `${targetUrl.pathname}${targetUrl.search}`
    } catch {
      // Keep relative non-URL values and normalize them below.
    }
  }

  if (!nextTarget.startsWith('/')) {
    nextTarget = `/${nextTarget}`
  }

  return nextTarget
}

export const normalizePushDeepLinkTarget = (
  rawTarget: unknown,
  origin = getDefaultOrigin()
) => {
  if (typeof rawTarget !== 'string') {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  const nextTarget = toSameOriginPath(rawTarget, origin)

  if (
    !nextTarget ||
    nextTarget.startsWith('//') ||
    nextTarget.startsWith(PUSH_ENTRY_ROUTE)
  ) {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  try {
    const targetUrl = new URL(nextTarget, origin)
    if (targetUrl.origin === origin && targetUrl.pathname === '/match-records') {
      const matchId = targetUrl.searchParams.get('match_id')?.trim()
      if (matchId) {
        return `/calendar?match_id=${encodeURIComponent(matchId)}`
      }
    }
  } catch {
    // Keep the normalized target if it is not parseable as a URL.
  }

  return nextTarget
}

export const buildPushEntryHash = (targetPath: string) =>
  `#${PUSH_ENTRY_ROUTE}?target=${encodeURIComponent(targetPath)}`
