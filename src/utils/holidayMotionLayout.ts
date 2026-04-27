type CssStyleMap = Record<string, string>
type MotionItem = {
  key?: string
  type?: string
  style?: CssStyleMap
  isPhaseClone?: boolean
  phaseCloneOf?: string | number
  [key: string]: any
}
type RandomFn = () => number

const HERO_POSITION_RULES: Record<string, { amount: number; min: number; max: number }> = {
  top: { amount: 7, min: 8, max: 70 },
  right: { amount: 10, min: 4, max: 38 },
  bottom: { amount: 5, min: 4, max: 22 },
  left: { amount: 10, min: 4, max: 42 },
}

const SITE_POSITION_RULES: Record<string, { amount: number; min: number; max: number }> = {
  top: { amount: 8, min: -22, max: 78 },
  right: { amount: 8, min: 2, max: 94 },
  bottom: { amount: 8, min: -24, max: 18 },
  left: { amount: 8, min: 2, max: 94 },
}

const CSS_VALUE_RE = /^(-?\d+(?:\.\d+)?)([a-z%]+)$/i
const ROTATE_VALUE_RE = /^rotate\((-?\d+(?:\.\d+)?)deg\)$/i
const PHASE_CLONE_TYPES = new Set(['petal', 'sakura', 'heart', 'confetti', 'snowflake'])

export const HOLIDAY_FIREWORKS_LAYOUT_REFRESH_MS = 10500
export const HOLIDAY_LAYOUT_BATCH_CROSSFADE_MS = 1600

export const isHolidayFireworksMotionPreset = (preset: unknown): boolean => {
  return typeof preset === 'string' && (preset === 'fireworks_burst' || preset.startsWith('fireworks_'))
}

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const parseCssValue = (value: unknown): { number: number; unit: string } | null => {
  if (typeof value !== 'string') return null
  const match = value.trim().match(CSS_VALUE_RE)
  if (!match) return null

  return {
    number: Number(match[1]),
    unit: match[2],
  }
}

const formatCssValue = (value: number, unit: string, precision = 2): string => {
  const factor = 10 ** precision
  const rounded = Math.round(value * factor) / factor
  return `${Number(rounded.toFixed(precision))}${unit}`
}

const convertCssTimeToSeconds = (value: unknown): number | null => {
  const parsed = parseCssValue(value)
  if (!parsed) return null

  if (parsed.unit === 'ms') {
    return parsed.number / 1000
  }

  if (parsed.unit === 's') {
    return parsed.number
  }

  return null
}

const hashSeed = (seed: string): number => {
  let hash = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const createSeededRandom = (seed: string): RandomFn => {
  let state = hashSeed(seed)

  return () => {
    state += 0x6d2b79f5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const randomBetween = (random: RandomFn, min: number, max: number): number => {
  return min + (max - min) * random()
}

const jitterValue = (
  value: string,
  random: RandomFn,
  amount: number,
  { min = -Infinity, max = Infinity, precision = 2 }: { min?: number; max?: number; precision?: number } = {}
): string => {
  const parsed = parseCssValue(value)
  if (!parsed) return value

  const nextValue = clampNumber(
    parsed.number + randomBetween(random, -amount, amount),
    min,
    max
  )

  return formatCssValue(nextValue, parsed.unit, precision)
}

const jitterRotateValue = (value: unknown, random: RandomFn, amount = 10): string => {
  if (typeof value !== 'string') return String(value ?? '')

  const match = value.trim().match(ROTATE_VALUE_RE)
  if (!match) return value

  const nextValue = Number(match[1]) + randomBetween(random, -amount, amount)
  return `rotate(${Math.round(nextValue)}deg)`
}

const jitterSizeValue = (value: string, random: RandomFn): string => {
  const parsed = parseCssValue(value)
  if (!parsed || parsed.unit !== 'rem') return value

  const amount = parsed.number >= 2 ? 0.45 : 0.18
  const min = parsed.number >= 2 ? 1.8 : 0.28
  return jitterValue(value, random, amount, { min, max: parsed.number + amount, precision: 2 })
}

const jitterTimeValue = (value: string, random: RandomFn, amount: number, min: number): string => {
  return jitterValue(value, random, amount, { min, max: 24, precision: 2 })
}

const jitterCssCustomProperty = (key: string, value: string, random: RandomFn): string => {
  if (key === '--holiday-opacity') {
    return jitterValue(value, random, 0.08, { min: 0.16, max: 1, precision: 2 })
  }

  if (key === '--holiday-rise-x') {
    return jitterValue(value, random, 16, { min: -36, max: 36, precision: 0 })
  }

  if (key === '--holiday-rise-y') {
    const parsed = parseCssValue(value)
    if (!parsed) return value

    const amount = parsed.unit === 'vh' ? 6 : 26
    return jitterValue(value, random, amount, { min: parsed.number - amount, max: parsed.number + amount, precision: parsed.unit === 'vh' ? 1 : 0 })
  }

  if (key === '--holiday-drift-x' || key === '--holiday-drift-y') {
    const parsed = parseCssValue(value)
    if (!parsed) return value

    const amount = parsed.unit === 'vh' ? 8 : 18
    return jitterValue(value, random, amount, { min: parsed.number - amount, max: parsed.number + amount, precision: parsed.unit === 'vh' ? 1 : 0 })
  }

  if (key === '--holiday-rotate-start' || key === '--holiday-rotate-end') {
    return jitterValue(value, random, 18, { min: -360, max: 360, precision: 0 })
  }

  return value
}

const randomizeStyleObject = (style: CssStyleMap = {}, random: RandomFn, scope = 'hero'): CssStyleMap => {
  const positionRules = scope === 'site' ? SITE_POSITION_RULES : HERO_POSITION_RULES
  const randomizedStyle: CssStyleMap = {}

  for (const [key, value] of Object.entries(style)) {
    if (positionRules[key]) {
      randomizedStyle[key] = jitterValue(value, random, positionRules[key].amount, {
        min: positionRules[key].min,
        max: positionRules[key].max,
        precision: 1,
      })
      continue
    }

    if (key === 'width' || key === 'height') {
      randomizedStyle[key] = jitterSizeValue(value, random)
      continue
    }

    if (key === 'animationDelay') {
      randomizedStyle[key] = jitterTimeValue(value, random, 0.7, 0)
      continue
    }

    if (key === 'animationDuration') {
      randomizedStyle[key] = jitterTimeValue(value, random, 1, 3.2)
      continue
    }

    if (key === 'transform') {
      randomizedStyle[key] = jitterRotateValue(value, random)
      continue
    }

    if (key.startsWith('--holiday-')) {
      randomizedStyle[key] = jitterCssCustomProperty(key, value, random)
      continue
    }

    randomizedStyle[key] = value
  }

  return randomizedStyle
}

const createPhaseCloneDelay = (style: CssStyleMap = {}): string | undefined => {
  const durationInSeconds = convertCssTimeToSeconds(style.animationDuration)
  if (durationInSeconds == null) return style.animationDelay

  const delayInSeconds = convertCssTimeToSeconds(style.animationDelay) ?? 0
  return formatCssValue(delayInSeconds - durationInSeconds / 2, 's', 2)
}

const buildRandomizedHolidayMotionItem = (
  item: MotionItem,
  index: number,
  { seed = '', scope = 'hero', variant = 'base' } = {}
): MotionItem => {
  const baseKey = item.key || item.type || index
  const random = createSeededRandom(`${scope}:${seed}:${baseKey}:${index}:${variant}`)
  const style = randomizeStyleObject(item.style, random, scope)

  const randomizedItem: MotionItem = {
    ...item,
    style,
  }

  if (variant === 'phase-clone') {
    randomizedItem.key = `${baseKey}--phase-clone`
    randomizedItem.style = {
      ...style,
      animationDelay: createPhaseCloneDelay(style) || style.animationDelay || '0s',
    }
    randomizedItem.isPhaseClone = true
    randomizedItem.phaseCloneOf = baseKey
  }

  return randomizedItem
}

export const createHolidayMotionLayoutNonce = () => {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(1)
    globalThis.crypto.getRandomValues(values)
    return values[0].toString(36)
  }

  return Math.random().toString(36).slice(2, 10)
}

export const randomizeHolidayMotionItems = (
  items: MotionItem[] = [],
  { seed = '', scope = 'hero', includePhaseClones = false } = {}
): MotionItem[] => {
  if (!Array.isArray(items) || !items.length) return []

  return items.flatMap((item, index) => {
    const randomizedItem = buildRandomizedHolidayMotionItem(item, index, {
      seed,
      scope,
      variant: 'base',
    })

    if (!includePhaseClones || !PHASE_CLONE_TYPES.has(item.type || '')) {
      return [randomizedItem]
    }

    return [
      randomizedItem,
      buildRandomizedHolidayMotionItem(item, index, {
        seed,
        scope,
        variant: 'phase-clone',
      }),
    ]
  })
}
