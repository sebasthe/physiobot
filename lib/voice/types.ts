export interface VoiceProvider {
  speak(text: string): Promise<void>
  stop(): void
}
