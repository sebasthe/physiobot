export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-10 pt-8 animate-pulse">
      <div className="mb-6">
        <div className="mb-4 h-5 w-40 rounded-full bg-[var(--teal-light)]" />
        <div className="mb-2 h-3 w-24 rounded-full bg-[var(--teal-light)]" />
        <div className="h-12 w-40 rounded-[18px] bg-[var(--sand)]" />
        <div className="mt-3 h-5 w-44 rounded-full bg-[var(--sand)]" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-[18px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-[var(--sand)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded-full bg-[var(--sand)]" />
                <div className="h-3 w-40 rounded-full bg-[var(--teal-light)]" />
              </div>
            </div>
            <div className="mt-3 h-3 w-32 rounded-full bg-[var(--sand)]" />
          </div>
        ))}
      </div>
    </main>
  )
}
