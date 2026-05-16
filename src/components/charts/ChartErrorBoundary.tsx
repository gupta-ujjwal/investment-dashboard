import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { title: string; children: ReactNode }
type State = { failed: boolean }

/**
 * Per-chart blast-radius bulkhead (reliability tenet 3). A render throw inside
 * one Recharts chart — a malformed data point, a Recharts internal — degrades
 * to a small placeholder instead of white-screening the whole `/analytics`
 * page. The KPI row and the other three charts keep rendering.
 */
export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[charts] "${this.props.title}" failed to render:`, error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-56 items-center justify-center px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            {this.props.title} unavailable
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
