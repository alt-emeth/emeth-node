declare module 'knex/types/tables' {
  interface Tables {
    jobs: Job
    lastWatchedBlock: LastWatchedBlock
    masterports: Masterport
    workers: Worker
    lastNodeSlotIndex: LastNodeSlotIndex
  }
}

export interface Job {
  jobId: string
  assignedNode: string
  status: JobStatus
  numOfAttempt: number
  createdAt: number
  updatedAt: number
}

export interface LastWatchedBlock {
  id?: number
  blockNumber: number
}

export interface LastNodeSlotIndex {
  id?: number
  slotIndex: number
}

export interface Masterport {
  jobId: string
  port: string
}

export interface Worker {
  ipAddress: string
  port: number
  batchSize: number
  powerCapacity: number
}

export enum JobStatus {
  REQUESTED = 0,
  ASSIGNED = 1,
  PROCESSING = 2,
  SUBMITTED = 3,
  VERIFIED = 4,
  REJECTED = 5,
  CANCELED = 6,
  TIMEOUT = 7,
  FAILED = 8,
  DECLINED = 9
}
