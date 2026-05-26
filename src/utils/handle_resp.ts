import { showMessage } from 'siyuan'
import type { OpenListResp } from './request'

export const handleResp = <T>(
  resp: OpenListResp<T>,
  success?: (data: T) => void,
  fail?: (message: string, code: number) => void,
  _auth: boolean = true,
  notify_error: boolean = true,
  notify_success?: boolean,
) => {
  if (resp.code === 200) {
    notify_success && showMessage(resp.message || 'success', 2000)
    success?.(resp.data)
  } else {
    const message = resp.message || `Siyuan Cloud code ${resp.code}`
    notify_error && showMessage(message, 4000, 'error')
    fail?.(message, resp.code)
  }
}

export const handleRespWithNotifySuccess = <T>(
  resp: OpenListResp<T>,
  success?: (data: T) => void,
  fail?: (message: string, code?: number) => void,
  auth: boolean = true,
  notify_error: boolean = true,
) => {
  return handleResp(resp, success, fail, auth, notify_error, true)
}
