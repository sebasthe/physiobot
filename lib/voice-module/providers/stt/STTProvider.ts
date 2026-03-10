export interface STTProvider {
  start(): Promise<void>
  stop(): void
  isActive(): boolean
  onPartialTranscript: ((text: string) => void) | null
  onCommittedTranscript: ((text: string) => void) | null
  onError: ((error: Error) => void) | null
}
