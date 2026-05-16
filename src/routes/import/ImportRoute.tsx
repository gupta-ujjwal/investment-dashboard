import { useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommitStep } from './CommitStep'
import { Instructions } from './Instructions'
import { PreviewStep } from './PreviewStep'
import { SourcePicker } from './SourcePicker'
import { UploadStep } from './UploadStep'
import { initialState, reducer, type WizardStep } from './wizardState'

const stepLabels: Record<WizardStep, string> = {
  'pick-source': 'Source',
  instructions: 'File',
  upload: 'Upload',
  preview: 'Review',
  committing: 'Commit',
  done: 'Done',
}
const stepOrder: WizardStep[] = ['pick-source', 'instructions', 'upload', 'preview', 'done']

/** Route component for `/import` — the wizard on its own page, so a
 *  focus-demanding multi-step flow is not stacked under Profile + FX. */
export function ImportRoute() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-bone-50 sm:text-3xl">
          Import
        </h1>
        <p className="font-sans text-sm text-bone-400">
          Bring in a broker export. Parsed and reconciled on this device — nothing
          leaves it.
        </p>
      </div>
      <ImportWizard />
    </div>
  )
}

export function ImportWizard() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <StepIndicator current={state.step} />

      {state.step === 'pick-source' && <SourcePicker dispatch={dispatch} />}
      {state.step === 'instructions' && state.source && (
        <Instructions source={state.source} dispatch={dispatch} />
      )}
      {state.step === 'upload' && state.source && (
        <UploadStep source={state.source} parseError={state.parseError} dispatch={dispatch} />
      )}
      {state.step === 'preview' && <PreviewStep state={state} dispatch={dispatch} />}
      {state.step === 'committing' && <CommitStep state="committing" />}
      {state.step === 'done' && (
        <CommitStep state="done" onContinue={() => navigate('/analytics')} />
      )}
    </div>
  )
}

function StepIndicator({ current }: { current: WizardStep }) {
  const displayed = current === 'committing' ? 'preview' : current
  const currentIdx = stepOrder.indexOf(displayed)

  return (
    <ol className="grid grid-cols-5 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10">
      {stepOrder.map((step, i) => {
        const active = i === currentIdx
        const done = i < currentIdx
        return (
          <li
            key={step}
            className={`flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-4 ${
              active ? 'bg-ink-850' : 'bg-ink-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center font-mono text-[10px] ${
                  active
                    ? 'bg-tick-400 text-ink-950'
                    : done
                      ? 'border border-jade-400 text-jade-400'
                      : 'border border-bone-100/15 text-bone-400'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`hidden font-mono text-[10px] uppercase tracking-[0.16em] sm:inline ${
                  active ? 'text-bone-50' : 'text-bone-400'
                }`}
              >
                {stepLabels[step]}
              </span>
            </div>
            <span
              className={`text-xs sm:hidden ${active ? 'text-bone-50' : 'text-bone-400'}`}
            >
              {stepLabels[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
