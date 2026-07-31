import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getActiveBrandResponsibilityGroups,
  getAutoBrandAssigneeIDs,
} from '../src/components/tasks/brandResponsibility.ts';

const users = [
  { id: 'jay', first_name: 'Jay', status: 'active' },
  { id: 'mek', first_name: 'Mek', status: 'active' },
  { id: 'toey', first_name: 'Toey', status: 'active' },
  { id: 'chin', first_name: 'Chin', status: 'active' },
  { id: 'disabled', first_name: 'Former employee', status: 'disabled' },
];

const brand = {
  id: 'wallcraft',
  name: 'Wallcraft',
  responsibilities: [
    { user_id: 'jay', responsibility_type: 'bd' },
    { user_id: 'mek', responsibility_type: 'bd' },
    { user_id: 'toey', responsibility_type: 'mkt' },
    { user_id: 'chin', responsibility_type: 'graphic' },
    { user_id: 'disabled', responsibility_type: 'mkt' },
    { user_id: 'missing-user', responsibility_type: 'graphic' },
  ],
};

test('auto-selects every active existing person related to the selected brand', () => {
  assert.deepEqual(
    getAutoBrandAssigneeIDs(brand, users),
    ['jay', 'mek', 'toey', 'chin'],
  );
});

test('groups every active existing brand responsibility for display', () => {
  const groups = getActiveBrandResponsibilityGroups(brand, users);

  assert.deepEqual(
    groups.map(group => ({
      type: group.type,
      userIDs: group.users.map(user => user.id),
    })),
    [
      { type: 'bd', userIDs: ['jay', 'mek'] },
      { type: 'mkt', userIDs: ['toey'] },
      { type: 'graphic', userIDs: ['chin'] },
    ],
  );
});
