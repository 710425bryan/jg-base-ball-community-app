export type TrainingNotificationProfile = {
  id: string;
  role: string | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

export const isActiveTrainingProfile = (
  profile: TrainingNotificationProfile | null | undefined,
  now: Date,
) => {
  if (!profile?.id || profile.is_active !== true || !Number.isFinite(now.getTime())) return false;

  const start = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const end = profile.access_end ? new Date(profile.access_end).getTime() : null;
  if (start !== null && (!Number.isFinite(start) || start > now.getTime())) return false;
  if (end !== null && (!Number.isFinite(end) || end < now.getTime())) return false;
  return true;
};

// Callers must build viewRoles from training:VIEW rows only. Linked members and
// other training actions never grant access to this feature on their own.
export const canReceiveTrainingNotification = (
  profile: TrainingNotificationProfile | null | undefined,
  viewRoles: ReadonlySet<string>,
  now: Date,
) => isActiveTrainingProfile(profile, now)
  && Boolean(profile?.role && (profile.role === "ADMIN" || viewRoles.has(profile.role)));
