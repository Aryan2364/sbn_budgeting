import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hashSync } from 'bcryptjs';
import type { Client } from 'pg';

/**
 * The baseline's fixture data: one small, fixed world in which every
 * access level and every complaint role exists today.
 *
 * Every id is FIXED, so two runs (or two builds) produce identical ids
 * and the snapshot can be compared line by line. Timestamps are fixed
 * too, and in the past, so nothing in a response depends on today's
 * date except the fields `matrix.ts` declares volatile.
 *
 * The people (today's levels, `user_module_access`):
 *
 *   platform_admin     platform admin only
 *   all_admin          platform + budget admin + complaints admin
 *   budget_admin       budget admin
 *   budget_staff       budget staff (created expense E1)
 *   staff_member       budget staff + complaints member (created E4, raised K5)
 *   complaints_admin   complaints admin (raised K6)
 *   raiser             complaints member, raised K1-K4, K7
 *   supervisor         Supervisor, complaints member; supervisor on Site A, K1-K4, K7
 *   supervisor2        Supervisor, complaints member; supervisor on Site B, K5, K6, K9
 *   manager            Manager, complaints member; manager of Site A; supervisors report to them
 *   approver           Project Director, complaints member; approver on K1-K4, K8, K10;
 *                      resolved K8 himself (D6) and raised K10 himself (D6, Q11)
 *   hod                HOD, complaints member
 *   ceo                CEO, complaints member
 *   no_module          signs in, no module at all
 *   no_login           budget admin on paper, but cannot sign in (401 everywhere)
 *   bystander          no module, cannot sign in, linked to nothing (the deletable person)
 *
 * Reporting chain: supervisor, supervisor2 -> manager -> approver -> hod -> ceo.
 */

export const FIXTURE_PASSWORD = 'harness-password';

const uuid = (head: string, n: number): string =>
  `${head}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const U = {
  platform_admin: uuid('a0000000', 1),
  all_admin: uuid('a0000000', 2),
  budget_admin: uuid('a0000000', 3),
  budget_staff: uuid('a0000000', 4),
  staff_member: uuid('a0000000', 5),
  complaints_admin: uuid('a0000000', 6),
  raiser: uuid('a0000000', 7),
  supervisor: uuid('a0000000', 8),
  supervisor2: uuid('a0000000', 9),
  manager: uuid('a0000000', 10),
  approver: uuid('a0000000', 11),
  hod: uuid('a0000000', 12),
  ceo: uuid('a0000000', 13),
  no_module: uuid('a0000000', 14),
  no_login: uuid('a0000000', 15),
  bystander: uuid('a0000000', 16),
} as const;
export type UserKey = keyof typeof U;

export const D = {
  supervisor: uuid('b0000000', 1),
  manager: uuid('b0000000', 2),
  hod: uuid('b0000000', 3),
  ceo: uuid('b0000000', 4),
  project_director: uuid('b0000000', 5),
  unused: uuid('b0000000', 6),
} as const;

export const L = { used: uuid('c0000000', 1), unused: uuid('c0000000', 2) } as const;
export const P = { with_sites: uuid('d0000000', 1), empty: uuid('d0000000', 2) } as const;
export const S = {
  a: uuid('e0000000', 1),
  b: uuid('e0000000', 2),
  c_no_people: uuid('e0000000', 3),
} as const;
export const CH = { one: uuid('f0000000', 1), two: uuid('f0000000', 2), unused: uuid('f0000000', 3) } as const;
export const E = {
  by_staff: uuid('10000000', 1),
  by_admin: uuid('10000000', 2),
  legacy: uuid('10000000', 3),
  by_staff_member: uuid('10000000', 4),
} as const;
export const CC = {
  pd_approval: uuid('20000000', 1),
  hod_approval: uuid('20000000', 2),
  no_approval: uuid('20000000', 3),
  inactive: uuid('20000000', 4),
} as const;
export const K = {
  open: uuid('30000000', 1),
  in_progress: uuid('30000000', 2),
  awaiting: uuid('30000000', 3),
  closed: uuid('30000000', 4),
  open_no_approval: uuid('30000000', 5),
  in_progress_no_approval: uuid('30000000', 6),
  legacy_location: uuid('30000000', 7),
  self_resolved: uuid('30000000', 8),
  closed_no_approval: uuid('30000000', 9),
  raised_by_approver: uuid('30000000', 10),
} as const;
export const PH = { k1_raise: uuid('40000000', 1) } as const;
export const N = { supervisor_k1: uuid('50000000', 1), raiser_k4: uuid('50000000', 2) } as const;

/** A 1x1 PNG: real enough for the server's magic-byte sniffing. */
export const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082',
  'hex',
);

export const K1_PHOTO_KEY = 'complaints/2025/C-000001/raise-1.png';

interface PersonFixture {
  key: UserKey;
  name: string;
  email: string | null;
  phone: string | null;
  canLogin: boolean;
  designation: string | null;
  reportsTo: UserKey | null;
  modules: Partial<Record<'platform' | 'budget' | 'complaints', string>>;
}

const PEOPLE: PersonFixture[] = [
  { key: 'platform_admin', name: 'Pallavi Platform', email: 'platform_admin@harness.test', phone: '9000000001', canLogin: true, designation: null, reportsTo: null, modules: { platform: 'admin' } },
  { key: 'all_admin', name: 'Ashok Alladmin', email: 'all_admin@harness.test', phone: '9000000002', canLogin: true, designation: null, reportsTo: null, modules: { platform: 'admin', budget: 'admin', complaints: 'admin' } },
  { key: 'budget_admin', name: 'Bhavna Budgetadmin', email: 'budget_admin@harness.test', phone: '9000000003', canLogin: true, designation: null, reportsTo: null, modules: { budget: 'admin' } },
  { key: 'budget_staff', name: 'Bharat Budgetstaff', email: 'budget_staff@harness.test', phone: '9000000004', canLogin: true, designation: null, reportsTo: null, modules: { budget: 'staff' } },
  { key: 'staff_member', name: 'Sonal Staffmember', email: 'staff_member@harness.test', phone: '9000000005', canLogin: true, designation: null, reportsTo: null, modules: { budget: 'staff', complaints: 'member' } },
  { key: 'complaints_admin', name: 'Chirag Complaintsadmin', email: 'complaints_admin@harness.test', phone: '9000000006', canLogin: true, designation: null, reportsTo: null, modules: { complaints: 'admin' } },
  { key: 'raiser', name: 'Rekha Raiser', email: 'raiser@harness.test', phone: '9000000007', canLogin: true, designation: null, reportsTo: null, modules: { complaints: 'member' } },
  { key: 'supervisor', name: 'Suresh Supervisor', email: 'supervisor@harness.test', phone: '9000000008', canLogin: true, designation: 'supervisor', reportsTo: 'manager', modules: { complaints: 'member' } },
  { key: 'supervisor2', name: 'Sima Supervisor', email: 'supervisor2@harness.test', phone: '9000000009', canLogin: true, designation: 'supervisor', reportsTo: 'manager', modules: { complaints: 'member' } },
  { key: 'manager', name: 'Mahesh Manager', email: 'manager@harness.test', phone: '9000000010', canLogin: true, designation: 'manager', reportsTo: 'approver', modules: { complaints: 'member' } },
  { key: 'approver', name: 'Anil Approver', email: 'approver@harness.test', phone: '9000000011', canLogin: true, designation: 'project_director', reportsTo: 'hod', modules: { complaints: 'member' } },
  { key: 'hod', name: 'Hema Hod', email: 'hod@harness.test', phone: '9000000012', canLogin: true, designation: 'hod', reportsTo: 'ceo', modules: { complaints: 'member' } },
  { key: 'ceo', name: 'Chandra Ceo', email: 'ceo@harness.test', phone: '9000000013', canLogin: true, designation: 'ceo', reportsTo: null, modules: { complaints: 'member' } },
  { key: 'no_module', name: 'Nisha Nomodule', email: 'no_module@harness.test', phone: '9000000014', canLogin: true, designation: null, reportsTo: null, modules: {} },
  { key: 'no_login', name: 'Naveen Nologin', email: 'no_login@harness.test', phone: '9000000015', canLogin: false, designation: null, reportsTo: null, modules: { budget: 'admin' } },
  { key: 'bystander', name: 'Bina Bystander', email: null, phone: null, canLogin: false, designation: null, reportsTo: null, modules: {} },
];

/** Label for a user id, for reports. Unknown ids (a restored database) print as themselves. */
export const USER_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(U).map(([k, v]) => [v, k]),
);

/**
 * Inserts the fixtures, committed, into a freshly migrated database.
 * Refuses to run if anything is already there.
 */
export async function seedFixtures(db: Client, uploadDir: string): Promise<void> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from users');
  if ((rows[0]?.n ?? 0) > 0) {
    throw new Error('seedFixtures: the test database already has users. Run with --setup to reset it.');
  }
  const hash = hashSync(FIXTURE_PASSWORD, 4);
  const at = (day: string): string => `${day}T05:30:00Z`;

  await db.query('begin');
  try {
    // Designations: the four migration-seeded rows get fixed ids (nothing
    // references them yet in a fresh database), plus two of our own.
    for (const [seed, id] of [
      ['supervisor', D.supervisor], ['manager', D.manager], ['hod', D.hod], ['ceo', D.ceo],
    ] as const) {
      await db.query('update designations set id = $1 where seed_key = $2', [id, seed]);
    }
    await db.query(
      `insert into designations (id, name, sort_order) values
         ($1, 'Project Director', 50), ($2, 'Unused Designation', 60)`,
      [D.project_director, D.unused],
    );

    for (const p of PEOPLE) {
      await db.query(
        `insert into users (id, name, email, phone, password_hash, can_login, designation_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [U[p.key], p.name, p.email, p.phone, p.email || p.phone ? hash : null, p.canLogin,
         p.designation ? D[p.designation as keyof typeof D] : null, at('2025-01-01')],
      );
      for (const [module, role] of Object.entries(p.modules)) {
        await db.query('insert into user_module_access (user_id, module, role) values ($1, $2, $3)', [
          U[p.key], module, role,
        ]);
      }
    }
    for (const p of PEOPLE) {
      if (p.reportsTo) {
        await db.query('update users set reports_to = $2 where id = $1', [U[p.key], U[p.reportsTo]]);
      }
    }

    await db.query(
      `insert into locations (id, name, created_at) values ($1, 'Morbi', $3), ($2, 'Unused Location', $3)`,
      [L.used, L.unused, at('2025-01-01')],
    );
    await db.query(
      `insert into projects (id, donor_name, name, planned_trees, created_at) values
         ($1, 'Harness Donor', 'Project With Sites', 10000, $3),
         ($2, 'Harness Donor', 'Empty Project', 500, $4)`,
      [P.with_sites, P.empty, at('2025-01-02'), at('2025-01-03')],
    );
    await db.query(
      `insert into sites (id, project_id, name, location_id, donor_name, planned_trees,
                          plantation_start_date, manager_id, supervisor_id, created_at) values
         ($1, $4, 'Site A', $5, null, 5000, '2025-02-01', $6, $7, $9),
         ($2, $4, 'Site B', null, 'Site Donor', 3000, '2025-02-15', null, $8, $10),
         ($3, null, 'Site C', null, null, 100, '2025-03-01', null, null, $11)`,
      [S.a, S.b, S.c_no_people, P.with_sites, L.used, U.manager, U.supervisor, U.supervisor2,
       at('2025-01-04'), at('2025-01-05'), at('2025-01-06')],
    );

    await db.query(
      `insert into cost_heads (id, name, sort_order, is_active) values
         ($1, 'Saplings', 1, true), ($2, 'Irrigation', 2, true), ($3, 'Unused Head', 3, false)`,
      [CH.one, CH.two, CH.unused],
    );
    await db.query(
      `insert into site_budgets (site_id, cost_head_id, period, per_tree_paise) values
         ($1, $3, 0, 4000), ($1, $4, 0, 1500), ($1, $3, 1, 2000), ($2, $3, 0, 3500)`,
      [S.a, S.b, CH.one, CH.two],
    );
    await db.query(
      `insert into expenses (id, site_id, cost_head_id, spent_on, period, amount_paise,
                             bill_number, approved_by, description, created_by, created_at) values
         ($1, $5, $7, '2025-04-10', 0, 1200000, 'B-1', 'Mahesh', 'Saplings batch', $9,  $12),
         ($2, $6, $7, '2025-04-11', 0,  800000, 'B-2', null,     null,             $10, $13),
         ($3, $5, $8, '2025-04-12', 0,  300000, null,  null,     'Legacy row',     null, $14),
         ($4, $6, $8, '2025-04-13', 0,  150000, 'B-4', null,     null,             $11, $15)`,
      [E.by_staff, E.by_admin, E.legacy, E.by_staff_member, S.a, S.b, CH.one, CH.two,
       U.budget_staff, U.budget_admin, U.staff_member,
       at('2025-04-10'), at('2025-04-11'), at('2025-04-12'), at('2025-04-13')],
    );

    await db.query(
      `insert into complaint_categories (id, name, sort_order, is_active, requires_approval,
                                         approver_designation_id, created_at) values
         ($1, 'Tree damage', 1, true, true, $5, $6),
         ($2, 'Water supply', 2, true, true, null, $6),
         ($3, 'Information', 3, true, false, null, $6),
         ($4, 'Retired category', 4, false, false, null, $6)`,
      [CC.pd_approval, CC.hod_approval, CC.no_approval, CC.inactive, D.project_director,
       at('2025-01-01')],
    );

    // The complaints: every status, both approval kinds, a legacy
    // location-only one, and one whose approver resolved it himself (D6).
    const chainA = [U.supervisor, U.manager, U.hod, U.ceo];
    const chainB = [U.supervisor2, U.manager, U.hod, U.ceo];
    const complaints: Array<{
      id: string; number: number; site: string | null; location: string | null; category: string;
      status: string; requiresApproval: boolean; raisedBy: string;
      people: string[]; approver: string | null; day: string;
      started?: boolean; resolvedBy?: string; closedBy?: string;
    }> = [
      { id: K.open, number: 1, site: S.a, location: null, category: CC.pd_approval, status: 'open', requiresApproval: true, raisedBy: U.raiser, people: chainA, approver: U.approver, day: '2025-06-01' },
      { id: K.in_progress, number: 2, site: S.a, location: null, category: CC.pd_approval, status: 'in_progress', requiresApproval: true, raisedBy: U.raiser, people: chainA, approver: U.approver, day: '2025-06-02', started: true },
      { id: K.awaiting, number: 3, site: S.a, location: null, category: CC.pd_approval, status: 'awaiting_approval', requiresApproval: true, raisedBy: U.raiser, people: chainA, approver: U.approver, day: '2025-06-03', started: true, resolvedBy: U.supervisor },
      { id: K.closed, number: 4, site: S.a, location: null, category: CC.pd_approval, status: 'closed', requiresApproval: true, raisedBy: U.raiser, people: chainA, approver: U.approver, day: '2025-06-04', started: true, resolvedBy: U.supervisor, closedBy: U.approver },
      { id: K.open_no_approval, number: 5, site: S.b, location: null, category: CC.no_approval, status: 'open', requiresApproval: false, raisedBy: U.staff_member, people: chainB, approver: null, day: '2025-06-05' },
      { id: K.in_progress_no_approval, number: 6, site: S.b, location: null, category: CC.no_approval, status: 'in_progress', requiresApproval: false, raisedBy: U.complaints_admin, people: chainB, approver: null, day: '2025-06-06', started: true },
      { id: K.legacy_location, number: 7, site: null, location: L.used, category: CC.hod_approval, status: 'open', requiresApproval: true, raisedBy: U.raiser, people: chainA, approver: U.hod, day: '2025-06-07' },
      { id: K.self_resolved, number: 8, site: S.a, location: null, category: CC.pd_approval, status: 'awaiting_approval', requiresApproval: true, raisedBy: U.raiser, people: [U.approver, U.manager, U.hod, U.ceo], approver: U.approver, day: '2025-06-08', started: true, resolvedBy: U.approver },
      // The approver raised it (revised plan D6 / Q11: the raiser may not approve).
      { id: K.raised_by_approver, number: 10, site: S.a, location: null, category: CC.pd_approval, status: 'awaiting_approval', requiresApproval: true, raisedBy: U.approver, people: chainA, approver: U.approver, day: '2025-06-10', started: true, resolvedBy: U.supervisor },
      { id: K.closed_no_approval, number: 9, site: S.b, location: null, category: CC.no_approval, status: 'closed', requiresApproval: false, raisedBy: U.staff_member, people: chainB, approver: null, day: '2025-06-09', started: true, resolvedBy: U.supervisor2, closedBy: U.supervisor2 },
    ];
    for (const c of complaints) {
      const [supervisorId, managerId, hodId, ceoId] = c.people;
      await db.query(
        `insert into complaints (id, number, site_id, location_id, category_id,
            complainant_name, complainant_phone, location_note, description, status,
            requires_approval, raised_by, raised_at, supervisor_id, manager_id, hod_id, ceo_id,
            approver_id, started_at, resolution_note, resolved_at, resolved_by, closed_at, closed_by,
            updated_at)
         values ($1, $2, $3, $4, $5, 'Harness Complainant', '9825012345', null, $6, $7,
                 $8, $9, $10, $11, $12, $13, $14, $15,
                 case when $16 then $10::timestamptz + interval '1 day' end,
                 case when $17::uuid is not null then 'Fixed it' end,
                 case when $17::uuid is not null then $10::timestamptz + interval '2 days' end,
                 $17,
                 case when $18::uuid is not null then $10::timestamptz + interval '3 days' end,
                 $18, $10)`,
        [c.id, c.number, c.site, c.location, c.category, `Harness complaint ${c.number}`, c.status,
         c.requiresApproval, c.raisedBy, at(c.day), supervisorId, managerId, hodId, ceoId, c.approver,
         Boolean(c.started), c.resolvedBy ?? null, c.closedBy ?? null],
      );
      await db.query(
        `insert into complaint_events (id, complaint_id, kind, actor_id, to_status, at)
         values ($1, $2, 'raised', $3, 'open', $4)`,
        [uuid('60000000', c.number * 10), c.id, c.raisedBy, at(c.day)],
      );
      if (c.started) {
        await db.query(
          `insert into complaint_events (id, complaint_id, kind, actor_id, from_status, to_status, at)
           values ($1, $2, 'started', $3, 'open', 'in_progress', $4::timestamptz + interval '1 day')`,
          [uuid('60000000', c.number * 10 + 1), c.id, supervisorId, at(c.day)],
        );
      }
    }
    await db.query(`select setval('complaint_number_seq', 100)`);

    await db.query(
      `insert into complaint_photos (id, complaint_id, stage, storage_key, content_type, bytes,
                                     original_name, uploaded_by, uploaded_at)
       values ($1, $2, 'raise', $3, 'image/png', $4, 'tree.png', $5, $6)`,
      [PH.k1_raise, K.open, K1_PHOTO_KEY, TINY_PNG.length, U.raiser, at('2025-06-01')],
    );
    const photoPath = join(uploadDir, K1_PHOTO_KEY);
    mkdirSync(dirname(photoPath), { recursive: true });
    writeFileSync(photoPath, TINY_PNG);

    await db.query(
      `insert into notifications (id, user_id, complaint_id, kind, title, created_at) values
         ($1, $3, $5, 'assigned', 'New complaint C-000001 for you', $7),
         ($2, $4, $6, 'closed', 'C-000004 was approved and closed', $8)`,
      [N.supervisor_k1, N.raiser_k4, U.supervisor, U.raiser, K.open, K.closed,
       at('2025-06-01'), at('2025-06-07')],
    );

    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
