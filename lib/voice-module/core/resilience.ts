export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private delayMs: number) {}

  call(fn: () => void): void {
    this.cancel()
    this.timer = setTimeout(() => {
      this.timer = null
      fn()
    }, this.delayMs)
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

interface SilenceEscalatorConfig {
  nudgeAfterMs: number
  checkAfterMs: number
  pauseAfterMs: number
  onNudge: () => void
  onCheck: () => void
  onPause: () => void
}

export class SilenceEscalator {
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(private config: SilenceEscalatorConfig) {}

  start(): void {
    this.clear()
    this.timers.push(setTimeout(() => this.config.onNudge(), this.config.nudgeAfterMs))
    this.timers.push(setTimeout(() => this.config.onCheck(), this.config.checkAfterMs))
    this.timers.push(setTimeout(() => this.config.onPause(), this.config.pauseAfterMs))
  }

  reset(): void {
    this.start()
  }

  stop(): void {
    this.clear()
  }

  private clear(): void {
    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers = []
  }
}
