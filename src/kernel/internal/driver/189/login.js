import { persistAddition } from "../common.js";
import { forwardProxy } from "../http.js";
import { rsaEncode, utf8Bytes } from "./upload.js";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Apple macOS 26_1_0) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/142.0.0.0 OpenList/425.6.30";

const headerValue = (headers = {}, name) => {
  const target = String(name).toLowerCase();
  for (const [key, value] of headerEntries(headers)) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? value.join("; ") : String(value || "");
  }
  return "";
};

const headerEntries = (headers = {}) => {
  if (Array.isArray(headers)) {
    return headers.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      return Object.entries(item);
    });
  }
  return Object.entries(headers || {});
};

const cookiePairs = (cookie) => String(cookie || "")
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item) => item.includes("="));

const cookieNames = (cookie) => cookiePairs(cookie)
  .map((item) => item.slice(0, item.indexOf("=")).trim())
  .filter(Boolean)
  .sort();

const filterCookieNames = (cookie, names) => {
  const values = new Map();
  for (const item of cookiePairs(cookie)) {
    const name = item.slice(0, item.indexOf("=")).trim();
    values.set(name, item);
  }
  return names
    .map((name) => values.get(name))
    .filter(Boolean)
    .join("; ");
};

const cookieForUrl = (storage, url) => {
  const cookie = storage.addition_json?.cookie || storage.addition_json?.Cookie || "";
  try {
    const host = new URL(url).hostname;
    if (host === "open.e.189.cn") return filterCookieNames(cookie, ["pageOp", "LT", "GUID"]);
  } catch {
    // fall through to the raw cookie string
  }
  return cookie;
};

const mergeCookies = (...cookies) => {
  const merged = new Map();
  for (const cookie of cookies) {
    for (const pair of cookiePairs(cookie)) {
      const index = pair.indexOf("=");
      const key = pair.slice(0, index).trim();
      if (!key) continue;
      merged.set(key, pair.slice(index + 1).trim());
    }
  }
  return Array.from(merged, ([key, value]) => `${key}=${value}`).join("; ");
};

const setCookieToCookie = (headers = {}) => {
  const values = [];
  for (const [key, value] of headerEntries(headers)) {
    if (String(key).toLowerCase() !== "set-cookie") continue;
    if (Array.isArray(value)) values.push(...value.map((item) => String(item || "")));
    else values.push(...String(value || "").split(/,(?=\s*[^;,=\s]+=[^;,]*)/));
  }
  return values
    .map((item) => item.trim().split(";")[0])
    .filter((item) => item.includes("="))
    .join("; ");
};

const formBody = (data) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data || {})) body.set(key, String(value ?? ""));
  return body.toString();
};

const responseLocation = (response, baseUrl) => {
  const location = headerValue(response?.headers, "Location");
  if (!location) return "";
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    return location;
  }
};

const isRedirectStatus = (status) => [301, 302, 303, 307, 308].includes(Number(status));

export const remember189Cookies = async (storage, response) => {
  const addition = storage.addition_json || {};
  const setCookie = setCookieToCookie(response?.headers);
  if (!setCookie) return;
  addition.cookie = mergeCookies(addition.cookie || addition.Cookie || "", setCookie);
  await persistAddition(storage);
};

const requestText = async (client, storage, url, options = {}) => {
  const headers = {
    Cookie: options.cookie === undefined
      ? cookieForUrl(storage, url)
      : options.cookie,
    "User-Agent": USER_AGENT,
    ...(options.headers || {}),
  };
  const response = await forwardProxy(client, url, {
    allowErrorStatus: true,
    headers,
    redirect: options.redirect,
    responseEncoding: "text",
    body: options.body,
    contentType: options.contentType,
    method: options.method,
  });
  await remember189Cookies(storage, response);
  return response;
};

const followLoginRedirect = async (client, storage, startUrl) => {
  let current = startUrl;
  let response = null;
  const chain = [];
  for (let index = 0; index < 10; index += 1) {
    response = await requestText(client, storage, current, {
      method: "GET",
      redirect: false,
    });
    const location = responseLocation(response, current);
    chain.push({
      from: safeUrl(current),
      location: location ? safeUrl(location) : "",
      status: Number(response?.status || 0),
    });
    if (!isRedirectStatus(response.status) || !location) {
      return { chain, response, url: current };
    }
    current = location;
  }
  return { chain, response, url: current };
};

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    const keys = Array.from(url.searchParams.keys()).sort();
    return `${url.origin}${url.pathname}${keys.length ? `?${keys.join(",")}` : ""}`;
  } catch {
    return String(value || "").split("?")[0];
  }
};

const loginContextSummary = ({ appId, chain, redirected, reqId, storage, lt } = {}) => JSON.stringify({
  app_id_present: !!appId,
  cookie_names: cookieNames(storage?.addition_json?.cookie || storage?.addition_json?.Cookie || ""),
  final_url: safeUrl(redirected || ""),
  has_lt: !!lt,
  has_reqid: !!reqId,
  redirect_chain: chain || [],
});

const postJson = async (client, storage, url, body, headers) => {
  const response = await requestText(client, storage, url, {
    allowErrorStatus: true,
    body,
    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    headers,
    method: "POST",
    responseEncoding: "text",
  });
  try {
    return JSON.parse(response.body || "{}");
  } catch {
    throw new Error(`189Cloud invalid JSON response from ${url}`);
  }
};

const hasLoginCookie = (addition) => cookieNames(addition?.cookie || addition?.Cookie || "")
  .some((name) => /^(cookieUserSession|COOKIE_LOGIN_USER)$/i.test(name));

const completeLogin = async (client, storage, payload) => {
  const addition = storage.addition_json || {};
  if (payload?.toUrl) {
    await followLoginRedirect(client, storage, payload.toUrl);
  }
  if (!hasLoginCookie(addition)) {
    throw new Error("189Cloud login failed: missing login cookie after successful authentication");
  }
  await persistAddition(storage);
};

export class Cloud189SmsVerifyRequired extends Error {
  constructor(message, {
    addition,
    context,
    mobile,
    showName,
  } = {}) {
    super(message);
    this.name = "Cloud189SmsVerifyRequired";
    this.verify = {
      type: "sms",
      mobile: mobile || "",
      second_context: context || null,
      show_name: showName || "",
    };
    this.addition = addition || {};
  }
}

const secondAuthHeaders = (context) => ({
  accept: "application/json;charset=UTF-8",
  "User-Agent": USER_AGENT,
  "X-Requested-With": "XMLHttpRequest",
  lt: context.lt || "",
  reqId: context.reqId || "",
  Referer: context.redirected || "",
  Origin: "https://open.e.189.cn",
});

const secondAuthData = (addition, context, smsCode) => {
  const conf = context.conf || {};
  const encrypt = context.encrypt || {};
  const userName = context.username || addition.username || "";
  return {
    mobile: context.mobile || "",
    appKey: context.appId || "cloud",
    userName: context.romaSecondAuth === "true"
      ? userName
      : `${encrypt.pre || ""}${rsaEncode(utf8Bytes(userName), encrypt.pubKey, true)}`,
    epd: `${encrypt.pre || ""}${rsaEncode(utf8Bytes(smsCode), encrypt.pubKey, true)}`,
    accountType: conf.accountType || "01",
    returnUrl: encodeURIComponent(conf.returnUrl || ""),
    isOauth2: String(!!conf.isOauth2),
    cb_SaveName: "3",
    state: conf.state || "",
    paramId: conf.paramId || "",
  };
};

const submitSecondAuth = async (client, storage, addition, context, smsCode) => {
  if (!context || !smsCode) throw new Error("189Cloud submitForSecondAuth failed: missing SMS verify context or code");
  const payload = await postJson(client, storage, "https://open.e.189.cn/api/logbox/oauth2/submitForSecondAuth.do", formBody(secondAuthData(addition, context, smsCode)), secondAuthHeaders(context));
  if (Number(payload?.result) !== 0) {
    throw new Error(`189Cloud submitForSecondAuth failed: ${payload?.msg || ""}`);
  }
  await completeLogin(client, storage, payload);
};

export const submit189Sms = async (client, storage, verify = {}) => {
  const addition = storage.addition_json || {};
  await submitSecondAuth(client, storage, addition, verify.second_context, verify.sms_code);
  return { addition };
};

export const login189 = async (client, storage, { allowSms = true } = {}) => {
  const addition = storage.addition_json || {};
  if (!addition.username || !addition.password) return;
  const loginUrl = "https://cloud.189.cn/api/portal/loginUrl.action?redirectURL=https%3A%2F%2Fcloud.189.cn%2Fmain.action";
  const loginPage = await followLoginRedirect(client, storage, loginUrl);
  const redirected = loginPage.url || loginUrl;
  if (redirected === "https://cloud.189.cn/web/main") return;
  const redirectedUrl = new URL(redirected);
  const lt = redirectedUrl.searchParams.get("lt") || "";
  const reqId = redirectedUrl.searchParams.get("reqId") || "";
  const appId = redirectedUrl.searchParams.get("appId") || "cloud";
  const authHeaders = {
    lt,
    reqId,
    Referer: redirected,
    Origin: "https://open.e.189.cn",
  };
  const ajaxHeaders = {
    accept: "application/json;charset=UTF-8",
    "User-Agent": USER_AGENT,
    "X-Requested-With": "XMLHttpRequest",
    ...authHeaders,
  };
  const appConf = await postJson(client, storage, "https://open.e.189.cn/api/logbox/oauth2/appConf.do", formBody({ version: "2.0", appKey: appId }), ajaxHeaders);
  if (String(appConf?.result) !== "0") {
    throw new Error(`189Cloud appConf failed: ${appConf?.msg || ""}; context=${loginContextSummary({
      appId,
      chain: loginPage.chain,
      redirected,
      reqId,
      storage,
      lt,
    })}`);
  }
  const encryptConf = await postJson(client, storage, "https://open.e.189.cn/api/logbox/config/encryptConf.do", formBody({ appId }), ajaxHeaders);
  if (Number(encryptConf?.result) !== 0) throw new Error(`189Cloud encryptConf failed: ${encryptConf?.msg || ""}`);
  const conf = appConf.data || {};
  const encrypt = encryptConf.data || {};
  const loginData = (apToken = "") => ({
    version: "v2.0",
    apToken,
    appKey: appId,
    pageKey: conf.pageKey || "",
    accountType: conf.accountType || "01",
    userName: `${encrypt.pre || ""}${rsaEncode(utf8Bytes(addition.username), encrypt.pubKey, true)}`,
    epd: `${encrypt.pre || ""}${rsaEncode(utf8Bytes(addition.password), encrypt.pubKey, true)}`,
    captchaType: "",
    validateCode: "",
    smsValidateCode: "",
    captchaToken: "",
    returnUrl: encodeURIComponent(conf.returnUrl || ""),
    mailSuffix: conf.mailSuffix || "@pan.cn",
    dynamicCheck: "FALSE",
    clientType: String(conf.clientType || 10010),
    cb_SaveName: "3",
    isOauth2: String(!!conf.isOauth2),
    state: "",
    paramId: conf.paramId || "",
  });
  let payload = await postJson(client, storage, "https://open.e.189.cn/api/logbox/oauth2/loginSubmit.do", formBody(loginData()), ajaxHeaders);
  if (Number(payload?.result) === -134 && payload?.apToken) {
    payload = await postJson(client, storage, "https://open.e.189.cn/api/logbox/oauth2/loginSubmit.do", formBody(loginData(payload.apToken)), ajaxHeaders);
  }
  if (Number(payload?.result) === -133) {
    if (!allowSms) {
      throw new Error("189Cloud SMS second verification is required; open the mount settings and verify SMS before browsing files");
    }
    const mobile = payload?.mobile || "";
    const showName = payload?.showName || "";
    const context = {
      appId,
      conf: {
        accountType: conf.accountType || "01",
        isOauth2: !!conf.isOauth2,
        paramId: conf.paramId || "",
        returnUrl: conf.returnUrl || "",
        state: conf.state || "",
      },
      encrypt: {
        pre: encrypt.pre || "",
        pubKey: encrypt.pubKey || "",
      },
      lt,
      mobile,
      redirected,
      reqId,
      romaSecondAuth: payload?.romaSecondAuth || "",
      username: addition.username,
    };
    const sendPayload = await postJson(client, storage, "https://open.e.189.cn/api/logbox/oauth2/sendSmsCodeForSecondAuth.do", formBody({
      mobile,
      appKey: appId,
    }), ajaxHeaders);
    if (Number(sendPayload?.result) !== 0) throw new Error(`189Cloud send second auth SMS failed: ${sendPayload?.msg || ""}`);
    throw new Cloud189SmsVerifyRequired("189Cloud SMS second verification is required", {
      addition,
      context,
      mobile,
      showName,
    });
  }
  if (Number(payload?.result) !== 0) throw new Error(`189Cloud loginSubmit failed: ${payload?.msg || ""}`);
  await completeLogin(client, storage, payload);
};
