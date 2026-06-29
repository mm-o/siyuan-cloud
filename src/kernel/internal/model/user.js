import { normalizePath } from "./path.js";

export const USER_ROLE = {
  GENERAL: 0,
  GUEST: 1,
  ADMIN: 2,
};

export const ADMIN_PERMISSION = 0x73ff;
export const USER_PERMISSION = {
  SEE_HIDES: 1 << 0,
  ACCESS_WITHOUT_PASSWORD: 1 << 1,
  OFFLINE_DOWNLOAD: 1 << 2,
  WRITE_CONTENT: 1 << 3,
  RENAME: 1 << 4,
  MOVE: 1 << 5,
  COPY: 1 << 6,
  REMOVE: 1 << 7,
  WEBDAV_READ: 1 << 8,
  WEBDAV_MANAGE: 1 << 9,
  READ_ARCHIVES: 1 << 12,
  DECOMPRESS: 1 << 13,
  SHARE: 1 << 14,
  CUSTOMIZE_SHARE_ID: 1 << 15,
};

export const isAdminUser = (user) => Number(user?.role) === USER_ROLE.ADMIN;
const hasPermission = (user, permission) => isAdminUser(user) || (Number(user?.permission || 0) & permission) !== 0;
export const canShare = (user) => isAdminUser(user) || (Number(user?.permission || 0) & USER_PERMISSION.SHARE) !== 0;
export const canCustomizeShareID = (user) => hasPermission(user, USER_PERMISSION.CUSTOMIZE_SHARE_ID);
export const canSeeHides = (user) => hasPermission(user, USER_PERMISSION.SEE_HIDES);
export const canAccessWithoutPassword = (user) => hasPermission(user, USER_PERMISSION.ACCESS_WITHOUT_PASSWORD);
export const canAddOfflineDownloadTasks = (user) => hasPermission(user, USER_PERMISSION.OFFLINE_DOWNLOAD);
export const canWriteContent = (user) => hasPermission(user, USER_PERMISSION.WRITE_CONTENT);
export const canRename = (user) => hasPermission(user, USER_PERMISSION.RENAME);
export const canMove = (user) => hasPermission(user, USER_PERMISSION.MOVE);
export const canCopy = (user) => hasPermission(user, USER_PERMISSION.COPY);
export const canRemove = (user) => hasPermission(user, USER_PERMISSION.REMOVE);
export const canWebdavRead = (user) => hasPermission(user, USER_PERMISSION.WEBDAV_READ);
export const canWebdavManage = (user) => hasPermission(user, USER_PERMISSION.WEBDAV_MANAGE);
export const canReadArchives = (user) => hasPermission(user, USER_PERMISSION.READ_ARCHIVES);
export const canDecompress = (user) => hasPermission(user, USER_PERMISSION.DECOMPRESS);

export const sanitizeUser = (user) => {
  const result = { ...(user || {}) };
  result.password = "";
  delete result.pwd_hash;
  delete result.pwd_salt;
  delete result.salt;
  delete result.logout_ts;
  delete result.logout_tokens;
  result.otp_secret = "";
  result.otp = !!(user?.otp || user?.otp_secret);
  return result;
};

export const normalizeUser = (input = {}, index = 0) => ({
  id: Number(input.id || index + 1),
  username: String(input.username || `user-${index + 1}`),
  password: input.password || "",
  pwd_hash: input.pwd_hash || input.PwdHash || "",
  pwd_salt: input.pwd_salt || input.salt || input.Salt || "",
  salt: input.salt || input.pwd_salt || input.Salt || "",
  pwd_ts: Number(input.pwd_ts || input.pwdTS || 0),
  logout_ts: Number(input.logout_ts || input.logoutTS || 0),
  logout_tokens: Array.isArray(input.logout_tokens) ? input.logout_tokens.map(String) : [],
  role: Number(input.role ?? USER_ROLE.GENERAL),
  disabled: !!input.disabled,
  base_path: normalizePath(input.base_path || "/"),
  permission: Number(input.permission ?? 0),
  sso_id: input.sso_id || "",
  otp: !!(input.otp || input.otp_secret),
  otp_secret: input.otp_secret || "",
  allow_ldap: input.allow_ldap === undefined ? true : !!input.allow_ldap,
  authn: input.authn || "[]",
  siyuan_account: input.siyuan_account || null,
});

export const defaultAdminUser = (username = "admin", account = null) => normalizeUser({
  id: 1,
  username,
  role: USER_ROLE.ADMIN,
  disabled: false,
  base_path: "/",
  permission: ADMIN_PERMISSION,
  siyuan_account: account,
}, 0);

export const defaultGuestUser = () => normalizeUser({
  id: 2,
  username: "guest",
  password: "guest",
  role: USER_ROLE.GUEST,
  disabled: true,
  base_path: "/",
  permission: 0,
}, 1);

const pickAccountName = (conf) => {
  const user = conf?.user || conf?.User || {};
  return String(user.userNickname || user.userName || user.UserNickname || user.UserName || "").trim();
};

export const accountFromSiyuanConf = (conf) => {
  const user = conf?.user || conf?.User || {};
  const username = pickAccountName(conf);
  if (!username) return null;
  return {
    user_id: String(user.userId || user.UserId || ""),
    user_name: String(user.userName || user.UserName || username),
    user_nickname: String(user.userNickname || user.UserNickname || username),
    user_avatar_url: String(user.userAvatarURL || user.UserAvatarURL || ""),
  };
};

export const syncDefaultUserWithSiyuan = (state, account) => {
  if (!state?.users?.length) state.users = [defaultAdminUser()];
  const admin = state.users.find((user) => Number(user.role) === USER_ROLE.ADMIN) || state.users[0];
  if (!account?.user_nickname && !account?.user_name) {
    Object.assign(admin, normalizeUser(admin, 0), {
      id: Number(admin.id || 1),
      role: USER_ROLE.ADMIN,
      disabled: false,
      permission: Number(admin.permission || ADMIN_PERMISSION),
    });
    return false;
  }
  const username = account.user_nickname || account.user_name;
  const changed = admin.username !== username || JSON.stringify(admin.siyuan_account || null) !== JSON.stringify(account);
  Object.assign(admin, normalizeUser(admin, 0), {
    id: Number(admin.id || 1),
    username,
    role: USER_ROLE.ADMIN,
    disabled: false,
    base_path: normalizePath(admin.base_path || "/"),
    permission: Number(admin.permission || ADMIN_PERMISSION),
    sso_id: admin.sso_id || account.user_id || "",
    siyuan_account: account,
  });
  return changed;
};
