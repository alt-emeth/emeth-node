export type IAuth = {
  sig:string
  timestamp:number
}

export type JSONRPCRequest = {
  jsonrpc: string
  method: string
  param?: any
  id?: number
}

export type JSONRPCReponse = {
  jsonrpc: string
  result: any
  id?: number
}

export type JSONRPCError = {
  jsonrpc: string
  error: {
    code: number
    message:string
  }
  id?: number
}

export type BoardJob = {
  id: string
  owner: string
  status: number
  programId: number
  datasetPath: string
  param?: string
  datasetSize: number
  fee: string
  deadline: number
  node?: string
  deposit?: string
  requestedAt: number
  startedAt?: number
  submittedAt?:number
  verifiedAt?:number
}