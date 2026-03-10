export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-[430px] px-5 pb-12 pt-8 animate-pulse md:max-w-4xl md:px-6 lg:max-w-5xl lg:px-8">
      <div className="mb-6">
        <div className="mb-4 h-5 w-40 rounded-full bg-[var(--teal-light)]" />
        <div className="mb-2 h-3 w-28 rounded-full bg-[var(--teal-light)]" />
        <div className="h-12 w-52 rounded-[18px] bg-[var(--sand)]" />
        <div className="mt-3 h-5 w-72 rounded-full bg-[var(--sand)]" />
      </div>

      <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {Array.from({ length: 4 }).map((_, index) => (
          <section key={index} className="surface-card p-4">
            <div className="mb-3 h-5 w-32 rounded-full bg-[var(--sand)]" />
            <div className="space-y-3">
              <div className="h-11 w-full rounded-[14px] bg-[var(--sand)]" />
              <div className="h-11 w-full rounded-[14px] bg-[var(--sand)]" />
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
