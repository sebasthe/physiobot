/**
 * Extracts a JSON object or array from a Claude response string.
 * Handles multiple formats different models may return:
 *   - Raw JSON
 *   - Markdown code fences (```json ... ```)
 *   - JSON embedded in surrounding prose
 */
export function extractJson<T = unknown>(text: string): T {
  // 1. Strip markdown code fences if present
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  // 2. Try parsing the stripped text directly
  try {
    return JSON.parse(stripped) as T
  } catch {
    // fall through
  }

  // 3. Find the first complete JSON object or array in the text
  const start = text.search(/[{[]/)
  if (start !== -1) {
    const opener = text[start]
    const closer = opener === '{' ? '}' : ']'
    const end = text.lastIndexOf(closer)
    if (end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T
    }
  }

  throw new SyntaxError(`Could not extract JSON from model response: ${text.slice(0, 200)}`)
}
