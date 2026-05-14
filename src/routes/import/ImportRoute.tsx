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
  committing: 'Review',
  done: 'Done',
}
const stepOrder: WizardStep[] = ['pick-source', 'instructions', 'upload', 'preview', 'done']

export function ImportRoute() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const navigate = useNavigate()

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-10 sm:py-16">
        <header className="reveal" style={{ '--i': 0 } as React.CSSProperties}>
          <h1 className="font-display text-4xl font-normal italic leading-tight tracking-tight text-ink sm:text-5xl">
            Import holdings.
          </h1>
          <p className="mt-3 max-w-prose text-sm text-ink-muted">
            All parsing happens in your browser. Nothing is uploaded.
          </p>
          <StepIndicator current={state.step} />
          <div className="rule-double mt-6" />
        </header>

        <div
          key={state.step}
          className="crossfade reveal mt-10"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {state.step === 'pick-source' && <SourcePicker dispatch={dispatch} />}
          {state.step === 'instructions' && state.source && (
            <Instructions source={state.source} dispatch={dispatch} />
          )}
          {state.step === 'upload' && state.source && (
            <UploadStep source={state.source} parseError={state.parseError} dispatch={dispatch} />
          )}
          {state.step === 'preview' && <PreviewStep state={state} dispatch={dispatch} />}
          {state.step === 'committing' && <CommitStep state="committing" />}
          {state.step === 'done' && <CommitStep state="done" onContinue={() => navigate('/')} />}
        </div>
      </div>
    </main>
  )
}

function StepIndicator({ current }: { current: WizardStep }) {
  const displayed = current === 'committing' ? 'preview' : current
  const currentIdx = stepOrder.indexOf(displayed)

  return (
    <nav aria-label="Import steps" className="mt-8">
      <ol className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm">
        {stepOrder.map((step, i) => {
          const isCurrent = i === currentIdx
          const isDone = i < currentIdx
          return (
            <li
              key={step}
              className={`flex items-baseline gap-2 ${
                isCurrent ? 'text-ink' : isDone ? 'text-ink-muted' : 'text-ink-soft'
              }`}
            >
              <span
                aria-hidden
                className={`font-mono text-xs ${
                  isCurrent ? 'text-brass' : isDone ? 'text-brass-dim' : 'text-ink-soft'
                }`}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={isCurrent ? 'font-medium' : ''}>{stepLabels[step]}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
