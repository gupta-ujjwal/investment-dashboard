import type { DiffResult } from '../../parsers/diff'
import type { ParseResult } from '../../parsers/types'
import type { Source } from '../../storage/holdings'

export type WizardStep = 'pick-source' | 'instructions' | 'upload' | 'preview' | 'committing' | 'done'

export type MissingDecision = 'keep' | 'delete'

export type WizardState = {
  step: WizardStep
  source: Source | null
  parseError: string | null
  parseResult: ParseResult | null
  diff: DiffResult | null
  decisions: Record<string, MissingDecision>
  commitError: string | null
}

export type WizardAction =
  | { type: 'pick-source'; source: Source }
  | { type: 'back-to-source' }
  | { type: 'instructions-acknowledged' }
  | { type: 'parse-failed'; message: string }
  | { type: 'parse-ok'; result: ParseResult; diff: DiffResult }
  | { type: 'set-decision'; sourceSymbol: string; decision: MissingDecision }
  | { type: 'set-all-decisions'; decision: MissingDecision }
  | { type: 'back-to-upload' }
  | { type: 'commit-started' }
  | { type: 'commit-failed'; message: string }
  | { type: 'commit-ok' }
  | { type: 'reset' }

export const initialState: WizardState = {
  step: 'pick-source',
  source: null,
  parseError: null,
  parseResult: null,
  diff: null,
  decisions: {},
  commitError: null,
}

export function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'pick-source':
      return { ...initialState, step: 'instructions', source: action.source }
    case 'back-to-source':
      return initialState
    case 'instructions-acknowledged':
      return { ...state, step: 'upload', parseError: null }
    case 'parse-failed':
      return { ...state, step: 'upload', parseError: action.message }
    case 'parse-ok': {
      const decisions: Record<string, MissingDecision> = {}
      for (const m of action.diff.missing) decisions[m.sourceSymbol] = 'keep'
      return {
        ...state,
        step: 'preview',
        parseError: null,
        parseResult: action.result,
        diff: action.diff,
        decisions,
      }
    }
    case 'set-decision':
      return {
        ...state,
        decisions: { ...state.decisions, [action.sourceSymbol]: action.decision },
      }
    case 'set-all-decisions': {
      if (!state.diff) return state
      const decisions: Record<string, MissingDecision> = {}
      for (const m of state.diff.missing) decisions[m.sourceSymbol] = action.decision
      return { ...state, decisions }
    }
    case 'back-to-upload':
      return { ...state, step: 'upload', parseResult: null, diff: null, decisions: {} }
    case 'commit-started':
      return { ...state, step: 'committing', commitError: null }
    case 'commit-failed':
      return { ...state, step: 'preview', commitError: action.message }
    case 'commit-ok':
      return { ...state, step: 'done', commitError: null }
    case 'reset':
      return initialState
  }
}
