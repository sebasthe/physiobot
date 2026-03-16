const VALID_SHORT = /^(ja|jo|ok|nein|stop|pause|weiter|fertig|gut|nächste|naechste|zurück|zurueck)$/i

export function shouldRequestRepeat(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return true
  if (/^[.\-_!?…]+$/.test(trimmed)) return true
  if (trimmed.length <= 2 && !VALID_SHORT.test(trimmed)) return true
  return false
}
