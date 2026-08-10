import { useLoaderData } from 'react-router-dom'
import { SettingsForm } from './SettingsForm'
import { DataBackupSection } from './DataBackupSection'
import { FEATURE_BASE_CURRENCY } from '../featureFlags'
import type { Settings } from '../storage/settings'
import type { CanonicalHolding } from '../storage/holdings'

export function SettingsRoute() {
  const { settings, holdings } = useLoaderData() as {
    settings: Settings
    holdings: CanonicalHolding[]
  }
  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-bone-50 sm:text-3xl">
          Settings
        </h1>
        <p className="font-sans text-sm text-bone-400">
          {settings.name ? `Hello, ${settings.name}. ` : ''}Configure your profile, base
          currency, and FX. All data stays on this device.
        </p>
      </div>

      {FEATURE_BASE_CURRENCY && (
        <section aria-labelledby="profile-heading" className="space-y-4">
          <h2
            id="profile-heading"
            className="font-sans text-sm font-medium text-bone-300"
          >
            Profile &amp; FX
          </h2>
          <SettingsForm />
        </section>
      )}

      <section aria-labelledby="data-heading" className="space-y-4">
        <h2
          id="data-heading"
          className="font-sans text-sm font-medium text-bone-300"
        >
          Data
        </h2>
        <DataBackupSection currentHoldings={holdings} />
      </section>
    </div>
  )
}
