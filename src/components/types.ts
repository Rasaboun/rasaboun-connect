// Shared UI/domain types used by App (the orchestrator) and the extracted
// screen components. Kept in a leaf module so neither side has to import the
// other just for a type (avoids a needless App <-> component cycle).

export type Filters = {
  noTransfer: boolean
  stepFree: boolean
  excludedModes: string[]
  excludedLines: string[]
}

export type MetricState = {
  inputTokens: number
  outputTokens: number
  latencyMs: number
}
