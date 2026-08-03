import type {
  Brand,
  BrandResponsibilityType,
  User,
} from '../../types';

export type BrandResponsibilityGroup = {
  type: BrandResponsibilityType;
  label: string;
  users: User[];
};

const responsibilityLabels: Record<BrandResponsibilityType, string> = {
  bd: 'BD',
  mkt: 'MKT',
  graphic: 'Graphic',
};

const responsibilityTypes: BrandResponsibilityType[] = ['bd', 'mkt', 'graphic'];

const normalizeTeamKey = (value?: string | null) => (
  (value || '').trim().toLowerCase().replace(/[^a-z]/g, '')
);

function getResponsibilityTypeForUser(user?: User | null): BrandResponsibilityType | null {
  if (!user) return null;
  const teamKey = normalizeTeamKey(user.team_short_name || user.team);
  if (teamKey === 'bd' || teamKey.includes('businessdevelop')) return 'bd';
  if (teamKey === 'mkt' || teamKey.includes('marketing')) return 'mkt';
  if (teamKey === 'gp' || teamKey.includes('graphic')) return 'graphic';
  return null;
}

export function getActiveBrandResponsibilityGroups(
  brand: Brand | undefined,
  users: User[],
): BrandResponsibilityGroup[] {
  const userByID = new Map(users.map(user => [user.id, user]));
  const hasTypedResponsibilities = Array.isArray(brand?.responsibilities);
  const responsibilities = hasTypedResponsibilities
    ? brand?.responsibilities ?? []
    : (brand?.responsible_user_ids ?? []).map(userID => ({
      user_id: userID,
      responsibility_type: 'bd' as const,
    }));

  return responsibilityTypes.map(type => ({
    type,
    label: responsibilityLabels[type],
    users: responsibilities
      .filter(item => item.responsibility_type === type)
      .map(item => userByID.get(item.user_id))
      .filter((user): user is User => (
        user?.status === 'active'
        && (hasTypedResponsibilities || user.position?.trim().toLowerCase() === 'bd')
      )),
  }));
}

export function getAutoBrandAssigneeIDs(
  brand: Brand | undefined,
  users: User[],
  currentUser?: User | null,
): string[] {
  return Array.from(new Set(
    getVisibleBrandResponsibilityGroups(brand, users, currentUser)
      .flatMap(group => group.users.map(user => user.id)),
  ));
}

export function getVisibleBrandResponsibilityGroups(
  brand: Brand | undefined,
  users: User[],
  currentUser?: User | null,
): BrandResponsibilityGroup[] {
  const groups = getActiveBrandResponsibilityGroups(brand, users);
  const teamType = getResponsibilityTypeForUser(currentUser);
  const teamIndex = teamType ? responsibilityTypes.indexOf(teamType) : -1;
  const mappedIndex = currentUser
    ? groups.reduce((lastIndex, group, index) => (
      group.users.some(user => user.id === currentUser.id) ? index : lastIndex
    ), -1)
    : -1;
  const currentIndex = Math.max(teamIndex, mappedIndex);
  if (currentIndex < 0) return groups.slice(0, 1);

  return groups.slice(0, currentIndex + 1);
}
