import { fetchOpenListJson } from './request'

export interface KernelStatusPayload {
  ok: boolean
  version?: string
  users?: number
  entries?: number
  storages?: number
  sharings?: number
  adapters?: string[]
  storage?: Record<string, any>
  routes?: string[]
  stages?: Array<{ key: string, status: 'done' | 'active' | 'todo' }>
}

export interface KernelStatusResult {
  data: KernelStatusPayload
  source: 'http'
}

export async function fetchKernelStatus(): Promise<KernelStatusResult> {
  const payload = await fetchOpenListJson('/siyuan-cloud/status')
  if (payload.code && payload.code !== 200)
    throw new Error(payload.message || `Siyuan Cloud code ${payload.code}`)
  return { data: payload.data as KernelStatusPayload, source: 'http' }
}
