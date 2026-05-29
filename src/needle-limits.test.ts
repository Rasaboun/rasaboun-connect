import { describe, expect, it } from 'vitest'
import { detectLimit } from './needle-limits'

describe('detectLimit', () => {
  it('flags round-trips', () => {
    expect(detectLimit('Châtelet à Nation aller-retour')).toBe('round-trip')
    expect(detectLimit('aller retour Bastille La Défense')).toBe('round-trip')
    expect(detectLimit('allers-retours Opéra Nation')).toBe('round-trip')
    expect(detectLimit('Châtelet à Nation A/R')).toBe('round-trip')
    expect(detectLimit('Châtelet à Nation et retour')).toBe('round-trip')
    expect(detectLimit('Chatelet to Nation round trip')).toBe('round-trip')
  })

  it('flags multiple destinations / étapes', () => {
    expect(detectLimit('Nation puis Bastille')).toBe('multi-dest')
    expect(detectLimit('Opéra en passant par Châtelet')).toBe('multi-dest')
    expect(detectLimit('Nation avec une étape à Lyon')).toBe('multi-dest')
    expect(detectLimit('Nation, plusieurs étapes')).toBe('multi-dest')
  })

  it('returns null for ordinary one-way queries', () => {
    expect(detectLimit('Comment aller de Châtelet à Nation ?')).toBeNull()
    expect(detectLimit('Bastille → La Défense demain 8h')).toBeNull()
    expect(detectLimit('arriver à Bastille avant 18h depuis Châtelet')).toBeNull()
    expect(detectLimit('Opéra depuis Nation en bus')).toBeNull()
    expect(detectLimit('Prochain métro à Saint-Lazare')).toBeNull()
    expect(detectLimit('')).toBeNull()
  })

  it('does not mistake "depuis" for "puis"', () => {
    expect(detectLimit('Opéra depuis Nation')).toBeNull()
  })

  it('prefers round-trip when both signals appear', () => {
    expect(detectLimit('Nation puis Bastille, aller-retour')).toBe('round-trip')
  })
})
