export const qrVerify = ({
  message = "",
  qrData = "",
  qr_data,
  qrSrc = "",
  qr_src,
  qrText = "",
  qr_text,
  status = "pending",
} = {}) => ({
  message,
  qr_data: qrData || qr_data || "",
  qr_src: qrSrc || qr_src || "",
  qr_text: qrText || qr_text || "",
  status,
  type: "qrcode",
});

export const qrVerifyError = (message, addition, verify) => {
  const error = new Error(message);
  error.addition = addition;
  error.verify = verify;
  return error;
};

export const clearQrKeys = (addition, keys) => {
  for (const key of keys) delete addition[key];
};

export const runQrLogin = async ({
  addition,
  clear,
  confirm,
  hasSession,
  pendingVerify,
  poll,
  start,
}) => {
  if (!hasSession(addition)) {
    const started = await start();
    throw qrVerifyError(started.message || "QR login pending", addition, qrVerify({
      ...started.verify,
      message: started.message || "",
      status: started.status || "waiting",
    }));
  }

  const state = await poll();
  if (state.status === "success") {
    const result = await confirm(state);
    clear?.();
    return result;
  }

  if (state.status === "expired" || state.status === "canceled") {
    clear?.();
    throw qrVerifyError(state.message || "QR code expired", addition, qrVerify({
      message: state.message || "",
      status: state.status,
    }));
  }

  throw qrVerifyError(state.message || "QR login pending", addition, qrVerify({
    ...pendingVerify(),
    message: state.message || "",
    status: state.status || "pending",
  }));
};
