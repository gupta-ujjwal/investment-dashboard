import { describe, it, expect } from 'vitest'
import { tagDedupeKey } from './budgetTags'

describe('tagDedupeKey', () => {
  it('is case- and whitespace-insensitive within a kind', () => {
    expect(tagDedupeKey('  Rent ', 'expense')).toBe(tagDedupeKey('rent', 'expense'))
  })

  it('separates the same label across kinds', () => {
    // "Interest" can be both an income (FD interest) and an expense (loan
    // interest) — same label, different kind, different tag.
    expect(tagDedupeKey('Interest', 'income')).not.toBe(
      tagDedupeKey('Interest', 'expense'),
    )
  })
})
