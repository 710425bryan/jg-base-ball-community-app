type SupabaseRpcErrorLike = {
  code?: string
  message?: string
  details?: string | null
}

const unavailableRpcFunctions = new Set<string>()

export const isSupabaseRpcMissingError = (error: unknown, functionName?: string) => {
  const rpcError = error as SupabaseRpcErrorLike | null

  if (!rpcError || rpcError.code !== 'PGRST202') {
    return false
  }

  if (!functionName) {
    return true
  }

  return [rpcError.message, rpcError.details]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.includes(functionName))
}

export const markSupabaseRpcUnavailable = (functionName: string) => {
  unavailableRpcFunctions.add(functionName)
}

export const isSupabaseRpcUnavailable = (functionName: string) => unavailableRpcFunctions.has(functionName)

export const resetSupabaseRpcAvailabilityCache = () => {
  unavailableRpcFunctions.clear()
}
