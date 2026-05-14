import { useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommitStep } from './CommitStep'
import { Instructions } from './Instructions'
import { PreviewStep } from './PreviewStep'
import { SourcePicker } from './SourcePicker'
import { UploadStep } from './UploadStep'
import { initialState, reducer, type WizardStep } from './wizardState'

const stepLabels: Record<WizardStep, string> = {
  'pick-source': 'Pick broker',
  instructions: 'Get your file',
  upload: 'Upload',
  preview: 'Review',
  committing: 'Committing',
  done: 'Done',
}
const stepOrder: WizardStep[] = ['pick-source', 'instructions', 'upload', 'preview', 'done']

export function ImportRoute() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Import holdings</h1>
          <p className="mt-1 text-sm text-slate-500">
            All parsing happens in your browser. Nothing is uploaded.
          </p>
          <StepIndicator current={state.step} />
        </header>

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
    </main>
  )
}

function StepIndicator({ current }: { current: WizardStep }) {
  const displayed = current === 'committing' ? 'preview' : current
  const currentIdx = stepOrder.indexOf(displayed)

  return (
    <ol className="mt-6 flex items-center gap-2 text-xs text-slate-500">
      {stepOrder.map((step, i) => {
        const active = i === currentIdx
        const done = i < currentIdx
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-inset ${
                active
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : done
                    ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                    : 'bg-white text-slate-400 ring-slate-300'
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? 'font-medium text-slate-900' : ''}>
              {stepLabels[step]}
            </span>
            {i < stepOrder.length - 1 && <span className="text-slate-300">›</span>}
          </li>
        )
      })}
    </ol>
  )
}
