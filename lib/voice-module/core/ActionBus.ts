export interface BusAction {
  source: 'voice' | 'ui'
  action: string
  payload: Record<string, unknown>
}

type ActionHandler = (action: BusAction) => void

export class ActionBus {
  private handlers = new Set<ActionHandler>()

  on(handler: ActionHandler): void {
    this.handlers.add(handler)
  }

  off(handler: ActionHandler): void {
    this.handlers.delete(handler)
  }

  dispatch(action: BusAction): void {
    for (const handler of this.handlers) {
      handler(action)
    }
  }

  destroy(): void {
    this.handlers.clear()
  }
}
