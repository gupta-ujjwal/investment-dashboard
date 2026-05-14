import { ImportWizard } from './import/ImportRoute'

export function SettingsRoute() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-bone-50 sm:text-3xl">
          Settings
        </h1>
        <p className="font-sans text-sm text-bone-400">
          Import and reconcile broker files. All parsing happens on-device.
        </p>
      </div>

      <section aria-labelledby="import-heading" className="space-y-4">
        <h2
          id="import-heading"
          className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300"
        >
          Import &amp; reconcile
        </h2>
        <ImportWizard />
      </section>
    </div>
  )
}
