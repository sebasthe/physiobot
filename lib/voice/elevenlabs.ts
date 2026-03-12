interface ElevenLabsErrorRecord {
  message?: unknown
  error?: unknown
  code?: unknown
  type?: unknown
  detail?: unknown
}

export interface ElevenLabsErrorDetails {
  provider: 'elevenlabs'
  status: number
  message: string
  code?: string
  type?: string
  requestId?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function resolveErrorRecord(payload: unknown): ElevenLabsErrorRecord | null {
  const record = asRecord(payload)
  if (!record) return null

  const detail = asRecord(record.detail)
  if (detail) {
    return detail as ElevenLabsErrorRecord
  }

  return record as ElevenLabsErrorRecord
}

export async function readElevenLabsError(
  response: Response,
  fallbackMessage: string,
): Promise<ElevenLabsErrorDetails> {
  let payload: unknown = null
  let rawText = ''
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      payload = await response.json()
    } else {
      rawText = (await response.text()).trim()
    }
  } catch {
    rawText = rawText.trim()
  }

  if (!rawText && typeof payload === 'string') {
    rawText = payload.trim()
  }

  const payloadRecord = asRecord(payload)
  const errorRecord = resolveErrorRecord(payload)
  const message = readString(errorRecord?.message)
    ?? readString(payloadRecord?.error)
    ?? rawText
    ?? fallbackMessage

  return {
    provider: 'elevenlabs',
    status: response.status,
    message,
    code: readString(errorRecord?.code),
    type: readString(errorRecord?.type),
    requestId: response.headers.get('x-trace-id') ?? undefined,
  }
}

export function toElevenLabsErrorPayload(error: ElevenLabsErrorDetails): Record<string, unknown> {
  return {
    error: error.message,
    provider: error.provider,
    providerStatus: error.status,
    providerCode: error.code,
    providerType: error.type,
    requestId: error.requestId,
  }
}
