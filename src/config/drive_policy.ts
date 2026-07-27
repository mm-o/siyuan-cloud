import { showMessage } from 'siyuan'

const normalizeProvider = (provider: string) => String(provider || '').trim().toLowerCase()

const uploadBlacklist = new Set([
  '115 cloud',
  '115 open',
  '115 share',
  '189cloudpc',
  '189cloudtv',
  'baidunetdisk',
  'github releases',
  'quarktv',
  'uctv',
  'wps',
  'siyuan-workspace',
])

const directDownloadBlacklist = new Set(['baidunetdisk'])

export const drivePolicy = {
  uploadBlacklist,
  directDownloadBlacklist,
} as const

export type DriveAction = 'upload' | 'download'

const FALLBACK: Record<DriveAction, string> = {
  upload: 'Upload is not supported for this storage.',
  download: 'Direct download is not supported for this storage.',
}

const actionBlacklist: Record<DriveAction, Set<string>> = {
  upload: uploadBlacklist,
  download: directDownloadBlacklist,
}

export function ensureDriveTransfer(provider: string, action: DriveAction, tf: (key: string, fallback: string) => string) {
  if (!actionBlacklist[action].has(normalizeProvider(provider)))
    return true
  showMessage(tf(`${action}NotSupported`, FALLBACK[action]), 3000, 'error')
  return false
}
