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
): string[] {
  return Array.from(new Set(
    getActiveBrandResponsibilityGroups(brand, users)
      .flatMap(group => group.users.map(user => user.id)),
  ));
}
