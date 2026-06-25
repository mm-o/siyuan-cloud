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
  SHARE: 1 << 14,
  CUSTOMIZE_SHARE_ID: 1 << 15,
};

export const isAdminUser = (user) => Number(user?.role) === USER_ROLE.ADMIN;
export const canShare = (user) => isAdminUser(user) || (Number(user?.permission || 0) & USER_PERMISSION.SHARE) !== 0;
export const canCustomizeShareID = (user) => isAdminUser(user) || (Number(user?.permission || 0) & USER_PERMISSION.CUSTOMIZE_SHARE_ID) !== 0;
export const canSeeHides = (user) => isAdminUser(user) || (Number(user?.permission || 0) & USER_PERMISSION.SEE_HIDES) !== 0;
export const canAccessWithoutPassword = (user) => isAdminUser(user) || (Number(user?.permission || 0) & USER_PERMISSION.ACCESS_WITHOUT_PASSWORD) !== 0;

export const sanitizeUser = (user) => {
  const result = { ...(user || {}) };
  result.password = "";
  result.otp_secret = "";
  result.otp = !!(user?.otp || user?.otp_secret);
  return result;
};

export const normalizeUser = (input = {}, index = 0) => ({
  id: Number(input.id || index + 1),
  username: String(input.username || `user-${index + 1}`),
  password: input.password || "",
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
