import { describe, expect, it } from 'vitest'
import { isSubmitSuccessEdge, type FetcherUiState } from './fetcherTransition'

const ok = { ok: true }
const fail = { ok: false }

type Row = [
  prevState: FetcherUiState,
  state: FetcherUiState,
  data: { ok: boolean } | undefined,
  expected: boolean,
]

describe('isSubmitSuccessEdge', () => {
  it('is true only for a non-idle → idle transition that landed ok:true', () => {
    expect(isSubmitSuccessEdge('submitting', 'idle', ok)).toBe(true)
    expect(isSubmitSuccessEdge('loading', 'idle', ok)).toBe(true)
  })

  // The full false table, pinned so a change is deliberate and reviewed.
  // The (idle → idle, ok) row is the reopen bug: a stay-mounted form's
  // fetcher still carries the previous save's {ok:true} while idle, so a
  // level-triggered "idle && ok" check would re-fire the close when the
  // parent re-renders with a fresh onClose closure.
  it('is false for every other transition', () => {
    const table: Row[] = [
      // resting state with stale data of any kind — the reopen-bug rows
      ['idle', 'idle', ok, false],
      ['idle', 'idle', fail, false],
      ['idle', 'idle', undefined, false],
      // submission starting or still in flight
      ['idle', 'loading', ok, false],
      ['idle', 'submitting', ok, false],
      ['loading', 'loading', ok, false],
      ['loading', 'submitting', ok, false],
      ['submitting', 'loading', ok, false],
      ['submitting', 'submitting', ok, false],
      // the landing cell with anything but a successful result
      ['loading', 'idle', fail, false],
      ['loading', 'idle', undefined, false],
      ['submitting', 'idle', fail, false],
      ['submitting', 'idle', undefined, false],
    ]
    for (const [prevState, state, data, expected] of table) {
      expect(
        isSubmitSuccessEdge(prevState, state, data),
        `${prevState} → ${state} with ${JSON.stringify(data)}`,
      ).toBe(expected)
    }
  })
})
