export interface TTSProvider {
  prepare?(): Promise<void>
  speak(text: string): Promise<void>
  stop(): void
  isSpeaking(): boolean
}
