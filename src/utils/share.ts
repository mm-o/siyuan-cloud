import { showMessage } from 'siyuan'
import { shareCreate } from './api'
import { promptText } from './file_ui'
import { handleRespWithNotifySuccess } from './handle_resp'
import { openListShareUrl, privateBase } from './request'

export async function createShareForPaths(options: {
  paths: string[]
  tf: (key: string, fallback: string) => string
}) {
  const files = options.paths.map(item => String(item || '').trim()).filter(Boolean)
  if (!files.length)
    return
  if (files.some(path => /^\/[A-Za-z]:/.test(path) || /^\/[^/]+:\//.test(path))) {
    showMessage(options.tf('shareLocalUnsupported', 'Local shares cannot be downloaded from browser share links'), 4000, 'error')
    return
  }
  const id = await promptText({
    title: options.tf('shareCreate', 'Create Share'),
    value: '',
    placeholder: options.tf('shareIdPlaceholder', 'Share ID, optional'),
    cancelText: options.tf('cancel', 'Cancel'),
    confirmText: options.tf('confirmAction', 'Confirm'),
  })
  if (id === null)
    return
  const pwd = await promptText({
    title: options.tf('sharePassword', 'Share Password'),
    value: '',
    placeholder: options.tf('sharePasswordPlaceholder', 'Password, optional'),
    cancelText: options.tf('cancel', 'Cancel'),
    confirmText: options.tf('confirmAction', 'Confirm'),
  })
  if (pwd === null)
    return
  const resp = await shareCreate({
    id: String(id || '').trim() || undefined,
    files,
    pwd: String(pwd || ''),
    remark: files.length === 1 ? files[0] : `${files.length} files`,
  })
  return new Promise<any>((resolve) => {
    handleRespWithNotifySuccess(resp, async (data: any) => {
      const shareId = encodeURIComponent(String(data?.id || ''))
      const url = await openListShareUrl(`${privateBase}/sd/${shareId}`)
      try {
        await navigator.clipboard?.writeText(url)
      } catch {
        showMessage(url, 3000, 'info')
      }
      window.dispatchEvent(new CustomEvent('siyuan-cloud:shares-changed'))
      showMessage(options.tf('shareCreated', 'Share created and copied'), 2000)
      resolve(data)
    }, () => resolve(null))
  })
}
