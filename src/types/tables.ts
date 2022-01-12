declare module 'knex/types/tables' {
  interface Tables {
    jobs: Job
    contributions: Contributions
    masterports: Masterport
    workers: Worker
    last_node_slot_index: LastNodeSlotIndex
    health_check: HealthCheck
    last_watched_job_index: LastWacthedJobIndex
  }
}

export interface Job {
  job_id: string
  data_size_mb: number
  program_id: number
  status: JobStatus
  num_attempt: number
}

export interface Contributions {
  job_id: string
  num_attempt:number
  worker_address: string
  master_address: string
  status:number
  started_at: number
  ended_at: number
  contribution: number
}

export interface LastWacthedJobIndex {
  job_index: number
}

export interface LastNodeSlotIndex {
  slot_index: number
}

export interface Masterport {
  job_id: string
  port: number
}

export interface Worker {
  url: string
  address: string
  power_capacity: number
}

export interface HealthCheck {
  checked_at: number
}

export enum JobStatus {
  REQUESTED = 0,
  // ASSIGNED = 1,
  PROCESSING = 2,
  SUBMITTED = 3,
  VERIFIED = 4,
  REJECTED = 5,
  CANCELED = 6,
  TIMEOUT = 7,
  FAILED = 8,
  DECLINED = 9
}

export enum ContributionStatus {
  NONE = 0,
  VERIFIED = 1,
  FAILED = 2,
  DISCONNECTED = 3
}
