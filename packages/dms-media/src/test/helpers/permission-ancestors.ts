const PERMISSION_ID_SEPARATOR = ".";

function ancestorsOf(permissionId: string): string[] {
  const segments = permissionId.split(PERMISSION_ID_SEPARATOR);
  return segments
    .slice(1)
    .map((_, index) =>
      segments.slice(0, index + 1).join(PERMISSION_ID_SEPARATOR),
    );
}

/** A permission set completed with every id its grants sit under, as the DMS roles editor stores a role. */
export function withPermissionAncestors(permissions: string[]): string[] {
  return [...new Set(permissions.flatMap((id) => [...ancestorsOf(id), id]))];
}
