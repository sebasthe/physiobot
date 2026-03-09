const PHASES = ['Aufwärmen', 'Hauptteil', 'Cooldown']

export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-10 pt-8 animate-pulse">
      <div className="mb-6">
        <div className="mb-4 h-5 w-40 rounded-full bg-[var(--teal-light)]" />
        <div className="mb-2 h-3 w-24 rounded-full bg-[var(--teal-light)]" />
        <div className="h-12 w-56 rounded-[18px] bg-[var(--sand)]" />
        <div className="mt-3 h-5 w-72 rounded-full bg-[var(--sand)]" />
      </div>

      <div className="space-y-5">
        {PHASES.map(phase => (
          <section key={phase} className="rounded-[20px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="h-6 w-32 rounded-full bg-[var(--sand)]" />
              <div className="h-4 w-16 rounded-full bg-[var(--teal-light)]" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={`${phase}-${index}`} className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="h-5 w-36 rounded-full bg-[var(--sand)]" />
                    <div className="h-5 w-14 rounded-full bg-[var(--teal-light)]" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded-full bg-[var(--sand)]" />
                    <div className="h-4 w-4/5 rounded-full bg-[var(--sand)]" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
