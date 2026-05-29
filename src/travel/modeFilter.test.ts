import { describe, expect, it } from 'vitest'
import { excludedModesFromIntent } from './modeFilter'
import type { SearchIntent } from './toolCall'

function intent(partial: Partial<SearchIntent>): SearchIntent {
  return {
    name: 'search_itinerary',
    origin: 'Nation',
    destination: 'Opéra',
    timeHuman: null,
    timeMode: null,
    includeModes: [],
    excludeModes: [],
    ...partial,
  }
}

describe('excludedModesFromIntent', () => {
  it('whitelists include_modes (forbids everything else)', () => {
    expect(excludedModesFromIntent(intent({ includeModes: ['bus'] }))).toEqual([
      'physical_mode:Metro',
      'physical_mode:RapidTransit',
      'physical_mode:Train',
      'physical_mode:Tramway',
    ])
  })

  it('maps transilien to the Train mode', () => {
    const excluded = excludedModesFromIntent(intent({ includeModes: ['transilien'] }))
    expect(excluded).not.toContain('physical_mode:Train')
    expect(excluded).toContain('physical_mode:Metro')
  })

  it('blacklists exclude_modes when no include is given', () => {
    expect(excludedModesFromIntent(intent({ excludeModes: ['bus', 'metro'] }))).toEqual([
      'physical_mode:Bus',
      'physical_mode:Metro',
    ])
  })

  it('returns nothing when no modes are specified', () => {
    expect(excludedModesFromIntent(intent({}))).toEqual([])
  })
})
