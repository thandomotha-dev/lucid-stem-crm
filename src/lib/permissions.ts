export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "lead:read", "lead:create", "lead:update", "lead:archive", "lead:export",
  "import:read", "import:create",
  "tag:manage", "customField:manage",
  "emailAccount:manage",
  "automation:pause",   // pausing is always safe, so members may do it
  "automation:resume",  // resuming sends email, so admins and above only
  "automation:manage",
  "audit:read",
  "user:manage", "org:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const viewer: Permission[] = ["lead:read", "import:read"];
const member: Permission[] = [...viewer, "lead:create", "lead:update", "import:create", "automation:pause"];
const admin: Permission[] = [
  ...member, "lead:archive", "lead:export", "tag:manage", "customField:manage",
  "emailAccount:manage", "automation:resume", "automation:manage", "audit:read",
];
const owner: Permission[] = [...admin, "user:manage", "org:manage"];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set(viewer),
  MEMBER: new Set(member),
  ADMIN: new Set(admin),
  OWNER: new Set(owner),
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role]?.has(permission) ?? false;
}

export class ForbiddenError extends Error {
  permission: Permission;
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
