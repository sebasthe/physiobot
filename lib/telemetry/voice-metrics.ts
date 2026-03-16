export interface TurnTimestamps {
  sttCommitTime: number
  classificationDoneTime: number | null
  llmFirstTokenTime: number | null
  llmDoneTime: number | null
  ttsStartTime: number | null
  ttsDoneTime: number | null
}

export interface TurnMetrics {
  sttToClassification: number | null
  classificationToFirstToken: number | null
  llmFirstToken: number | null
  llmTotal: number | null
  ttsLatency: number | null
  totalTurnTime: number | null
}

export interface TurnMetricsPayload extends TurnMetrics {
  timestamps: TurnTimestamps
  utteranceCategory: 'command' | 'question' | 'feedback' | 'filler' | 'acknowledgment' | null
  classificationFastPath: boolean
  commandName: string | null
  skippedReason: 'command' | 'filler' | 'acknowledgment' | null
  llmTimedOut: boolean
}

export function computeTurnMetrics(ts: TurnTimestamps): TurnMetrics {
  return {
    sttToClassification: computeSegment(ts.sttCommitTime, ts.classificationDoneTime),
    classificationToFirstToken: computeSegment(ts.classificationDoneTime, ts.llmFirstTokenTime),
    llmFirstToken: computeSegment(ts.sttCommitTime, ts.llmFirstTokenTime),
    llmTotal: computeSegment(ts.sttCommitTime, ts.llmDoneTime),
    ttsLatency: computeSegment(ts.ttsStartTime, ts.ttsDoneTime),
    totalTurnTime: computeSegment(ts.sttCommitTime, ts.ttsDoneTime),
  }
}

export function createTurnMetricsPayload(params: {
  timestamps: TurnTimestamps
  utteranceCategory?: TurnMetricsPayload['utteranceCategory']
  classificationFastPath?: boolean
  commandName?: string | null
  skippedReason?: TurnMetricsPayload['skippedReason']
  llmTimedOut?: boolean
}): TurnMetricsPayload {
  return {
    ...computeTurnMetrics(params.timestamps),
    timestamps: params.timestamps,
    utteranceCategory: params.utteranceCategory ?? null,
    classificationFastPath: params.classificationFastPath ?? false,
    commandName: params.commandName ?? null,
    skippedReason: params.skippedReason ?? null,
    llmTimedOut: params.llmTimedOut ?? false,
  }
}

function computeSegment(start: number | null, end: number | null): number | null {
  if (start === null || end === null) {
    return null
  }

  return Math.max(0, end - start)
}
