/**
 * Edge detector for react-router `useFetcher` "action succeeded" transitions.
 *
 * `AssetForm` and `HoldingForm` stay mounted across open cycles — they render
 * `null` when closed — so their fetcher keeps the last action's result
 * (`{ok:true}`) while idle; react-router only clears fetcher data on unmount.
 * Their close-on-success effect must therefore fire on the non-idle → idle
 * transition that landed `ok:true`, never on the resting state: the parent
 * passes a fresh `onClose` closure on every render, which re-runs the effect
 * when the modal is opened again, and a level-triggered `idle && ok` check
 * would instantly re-close it (the "edit a second row / re-open Add does
 * nothing until reload" bug).
 *
 * The caller owns the previous-state ref and must consult the predicate
 * before updating it:
 *
 *   const prevFetcherStateRef = useRef(fetcher.state)
 *   useEffect(() => {
 *     if (isSubmitSuccessEdge(prevFetcherStateRef.current, fetcher.state, fetcher.data)) onClose()
 *     prevFetcherStateRef.current = fetcher.state
 *   }, [fetcher.state, fetcher.data, onClose])
 */

/** Mirrors react-router's fetcher.state values ("idle" | "loading" | "submitting"). */
export type FetcherUiState = 'idle' | 'loading' | 'submitting'

export function isSubmitSuccessEdge(
  prevState: FetcherUiState,
  state: FetcherUiState,
  data: { ok: boolean } | undefined,
): boolean {
  return prevState !== 'idle' && state === 'idle' && data?.ok === true
}
