export interface STTProvider {
  start(): Promise<void>
  stop(): void
  isActive(): boolean
  onListeningStateChange: ((active: boolean) => void) | null
  onPartialTranscript: ((text: string) => void) | null
  onCommittedTranscript: ((text: string) => void) | null
  onError: ((error: Error) => void) | null
}
