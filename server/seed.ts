// Creates data/manageplus.xlsx with demo data. Run via `npm run seed` (or
// automatically on first server start when the workbook doesn't exist).
// Every demo account uses the password: welcome123
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { hashPassword } from './auth';
import { DATA_PATH } from './store';

const PASSWORD = 'welcome123';

type Cell = string | number;
type SheetSpec = { headers: string[]; rows: Cell[][] };

const employeeHeaders = [
  'employeeId', 'name', 'email', 'designation', 'mentorId', 'currentProject',
  'projectHistory', 'skills', 'growthStatus', 'joinDate', 'isAdmin', 'passwordHash',
];

// [id, name, email, designation, mentorId, project, history, skills, growth, joined, isAdmin]
const people: Cell[][] = [
  ['EMP-001', 'Siddhu Nallasivam', 'snallasivam@presidio.com', 'Engineering Manager', '',
    'MatchDay Platform', 'MatchDay Platform; LeaguePulse; ScoutIQ',
    'Architecture, Node.js, React, People Management', 'On Track', '2021-03-15', 'no'],
  ['EMP-002', 'Priya Sharma', 'psharma@presidio.com', 'Lead Engineer', 'EMP-001',
    'MatchDay Platform', 'MatchDay Platform; FanZone',
    'React, TypeScript, GraphQL, System Design', 'Exceeding', '2021-11-01', 'no'],
  ['EMP-003', 'Daniel Chen', 'dchen@presidio.com', 'Lead Engineer', 'EMP-001',
    'ScoutIQ', 'ScoutIQ; LeaguePulse; Gateway',
    'Python, Data Engineering, AWS, Kubernetes', 'On Track', '2022-02-14', 'no'],
  ['EMP-004', 'Nina Patel', 'npatel@presidio.com', 'Senior Engineer', 'EMP-001',
    'LeaguePulse', 'LeaguePulse; MatchDay Platform',
    'Node.js, PostgreSQL, Redis, Observability', 'On Track', '2022-07-04', 'no'],
  ['EMP-005', 'Arjun Mehta', 'amehta@presidio.com', 'Senior Engineer', 'EMP-002',
    'MatchDay Platform', 'MatchDay Platform',
    'React, TypeScript, Node.js, Testing', 'Exceeding', '2022-09-19', 'no'],
  ['EMP-006', 'Rohan Iyer', 'riyer@presidio.com', 'Associate Engineer', 'EMP-002',
    'FanZone', 'FanZone', 'React, CSS, JavaScript', 'Needs Attention', '2024-06-10', 'no'],
  ['EMP-007', 'Meera Krishnan', 'mkrishnan@presidio.com', 'Senior Engineer', 'EMP-003',
    'ScoutIQ', 'ScoutIQ; Gateway', 'Python, Airflow, dbt, SQL', 'On Track', '2023-01-23', 'no'],
  ['EMP-008', 'Sofia Martinez', 'smartinez@presidio.com', 'Senior Engineer', 'EMP-003',
    'Gateway', 'Gateway; ScoutIQ', 'Go, Kubernetes, Terraform, AWS', 'Exceeding', '2022-05-30', 'no'],
  ['EMP-009', 'Alex Thompson', 'athompson@presidio.com', 'Associate Engineer', 'EMP-003',
    'ScoutIQ', 'ScoutIQ', 'Python, SQL, Pandas', 'On Track', '2024-10-07', 'no'],
  ['EMP-010', 'Kavya Reddy', 'kreddy@presidio.com', 'Associate Engineer', 'EMP-005',
    'MatchDay Platform', 'MatchDay Platform', 'React, TypeScript, Storybook', 'On Track', '2025-02-17', 'no'],
  ['EMP-011', 'Ethan Walker', 'ewalker@presidio.com', 'Associate Engineer', 'EMP-008',
    'Gateway', 'Gateway', 'Go, Docker, CI/CD', 'On Track', '2025-05-12', 'no'],
  ['EMP-012', "Liam O'Brien", 'lobrien@presidio.com', 'Associate Engineer', 'EMP-004',
    'LeaguePulse', 'LeaguePulse', 'Node.js, Express, MongoDB', 'Needs Attention', '2024-08-26', 'no'],
  ['EMP-013', 'Maya Fernandes', 'admin@presidio.com', 'People Operations Admin', '',
    'People Ops', 'People Ops', 'HRIS, Operations, Analytics', 'On Track', '2020-01-06', 'yes'],
];

const columnRows: Cell[][] = [
  // key, label, type, options, core, visible, order
  ['name', 'Name', 'text', '', 'yes', 'yes', 1],
  ['employeeId', 'Employee ID', 'text', '', 'yes', 'yes', 2],
  ['email', 'Email', 'text', '', 'yes', 'yes', 3],
  ['designation', 'Designation', 'select', 'Associate Engineer,Senior Engineer,Lead Engineer,Engineering Manager', 'yes', 'yes', 4],
  ['mentorId', 'Mentor', 'text', '', 'yes', 'yes', 5],
  ['currentProject', 'Current Project', 'text', '', 'yes', 'yes', 6],
  ['skills', 'Skills', 'tags', '', 'yes', 'yes', 7],
  ['growthStatus', 'Growth Status', 'select', 'On Track,Exceeding,Needs Attention', 'yes', 'yes', 8],
  ['projectHistory', 'Project History', 'tags', '', 'yes', 'no', 9],
  ['joinDate', 'Join Date', 'date', '', 'yes', 'no', 10],
];

const designationGoals: Cell[][] = [
  // id, designation, title, description, category
  ['dg-ae-1', 'Associate Engineer', 'Deliver small features end-to-end', 'Take well-scoped features from design to production with guidance from a mentor.', 'Delivery'],
  ['dg-ae-2', 'Associate Engineer', 'Write tested, reviewed code', 'Keep new code covered by tests and respond to review feedback within a working day.', 'Craft'],
  ['dg-ae-3', 'Associate Engineer', 'Grow core stack proficiency', "Deepen fluency in the team's primary stack; complete at least one learning goal per quarter.", 'Learning'],
  ['dg-ae-4', 'Associate Engineer', 'Communicate progress proactively', 'Surface blockers early and keep tickets and standup updates current.', 'Collaboration'],
  ['dg-se-1', 'Senior Engineer', 'Lead feature design and delivery', 'Own the design, breakdown, and delivery of medium-to-large features with minimal oversight.', 'Delivery'],
  ['dg-se-2', 'Senior Engineer', 'Mentor associate engineers', 'Actively mentor at least one associate engineer: pairing, review depth, and career guidance.', 'Leadership'],
  ['dg-se-3', 'Senior Engineer', 'Raise the bar on code quality', 'Drive meaningful code reviews and improve standards, tooling, or test strategy on your team.', 'Craft'],
  ['dg-se-4', 'Senior Engineer', 'Own production health', 'Own the operational health of your services: monitoring, alerts, and incident follow-through.', 'Operations'],
  ['dg-le-1', 'Lead Engineer', 'Own the team technical roadmap', 'Define and maintain the technical roadmap; align it with product priorities each quarter.', 'Strategy'],
  ['dg-le-2', 'Lead Engineer', 'Grow senior engineers', 'Develop senior engineers toward lead scope through delegation and structured mentorship.', 'Leadership'],
  ['dg-le-3', 'Lead Engineer', 'Drive cross-team architecture alignment', 'Represent the team in architecture reviews and resolve cross-team technical conflicts.', 'Strategy'],
  ['dg-le-4', 'Lead Engineer', 'Balance delivery speed and system health', 'Keep a deliberate balance between shipping and paying down technical debt.', 'Operations'],
  ['dg-em-1', 'Engineering Manager', 'Build a healthy, high-performing team', 'Hire, coach, and retain a team that delivers predictably and grows continuously.', 'Leadership'],
  ['dg-em-2', 'Engineering Manager', 'Run fair, timely review cycles', 'Complete every review cycle and quarterly check-in on schedule with written feedback.', 'Operations'],
];

const individualGoals: Cell[][] = [
  // id, employeeId, title, description, category, status, targetDate
  ['ig-priya-1', 'EMP-002', 'Drive MatchDay re-architecture RFC to sign-off', 'Author and shepherd the modularization RFC through architecture review.', 'Strategy', 'in_progress', '2026-09-30'],
  ['ig-priya-2', 'EMP-002', 'Coach Arjun toward Lead scope', 'Delegate roadmap slices to Arjun and coach him through two lead-level deliveries.', 'Leadership', 'in_progress', '2026-12-15'],
  ['ig-daniel-1', 'EMP-003', 'Cut ScoutIQ pipeline costs by 25%', 'Profile and optimize the ingestion pipeline; move batch jobs to spot instances.', 'Operations', 'in_progress', '2026-10-31'],
  ['ig-nina-1', 'EMP-004', 'Lead LeaguePulse v2 launch', 'Own the v2 rollout end-to-end including the migration plan and launch review.', 'Delivery', 'in_progress', '2026-11-20'],
  ['ig-nina-2', 'EMP-004', 'Complete AWS Solutions Architect certification', 'Pass the SA Associate exam to deepen infrastructure ownership.', 'Learning', 'completed', '2026-05-31'],
  ['ig-arjun-1', 'EMP-005', 'Present at the internal architecture guild', 'Prepare and deliver a talk on the MatchDay component model.', 'Learning', 'completed', '2026-04-15'],
  ['ig-arjun-2', 'EMP-005', 'Own the MatchDay testing strategy overhaul', 'Replace brittle E2E suites with a layered testing strategy; halve CI flake rate.', 'Craft', 'in_progress', '2026-09-15'],
  ['ig-rohan-1', 'EMP-006', 'Close accessibility debt on FanZone', 'Bring the FanZone web app to WCAG AA: audit, fix, and add regression checks.', 'Craft', 'in_progress', '2026-08-31'],
  ['ig-meera-1', 'EMP-007', 'Ship the ScoutIQ data-quality dashboard', 'Design and ship freshness/completeness monitoring for scouting datasets.', 'Delivery', 'in_progress', '2026-09-30'],
  ['ig-sofia-1', 'EMP-008', 'Design multi-region Gateway failover', 'Produce and validate the failover design with a game-day exercise.', 'Strategy', 'in_progress', '2026-10-15'],
  ['ig-alex-1', 'EMP-009', 'Automate weekly scouting reports', 'Replace the manual report assembly with a scheduled pipeline.', 'Delivery', 'completed', '2026-06-30'],
  ['ig-kavya-1', 'EMP-010', 'Ship the FanZone notification center solo', 'Deliver the notification center feature end-to-end as the sole owner.', 'Delivery', 'in_progress', '2026-09-30'],
  ['ig-kavya-2', 'EMP-010', 'Complete TypeScript deep-dive course', 'Finish the advanced TypeScript course and apply patterns in MatchDay code.', 'Learning', 'in_progress', '2026-08-31'],
  ['ig-ethan-1', 'EMP-011', 'Own the Gateway CI pipeline', 'Take ownership of CI: cut build times by 30% and document the pipeline.', 'Operations', 'in_progress', '2026-09-30'],
  ['ig-liam-1', 'EMP-012', 'Stabilize the LeaguePulse flaky test suite', 'Identify and fix the top flaky tests; add quarantine tooling.', 'Craft', 'not_started', '2026-09-15'],
];

// Annual 2025 (completed), Mid-Year 2026 (staggered statuses), H2 2026 (not started)
const reviewCycles: Cell[][] = [
  // id, employeeId, name, startDate, endDate, status, rating, notes
  ['rc-002-1', 'EMP-002', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 5, 'Exceptional year leading the MatchDay platform work.'],
  ['rc-003-1', 'EMP-003', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 4, 'Strong technical leadership on ScoutIQ.'],
  ['rc-004-1', 'EMP-004', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 4, 'Reliable delivery on LeaguePulse; growing infra depth.'],
  ['rc-005-1', 'EMP-005', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 5, 'Standout senior performance; clear lead trajectory.'],
  ['rc-006-1', 'EMP-006', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 2, 'Delivery consistency needs improvement; support plan agreed.'],
  ['rc-007-1', 'EMP-007', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 4, 'Solid data engineering ownership.'],
  ['rc-008-1', 'EMP-008', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 5, 'Gateway reliability transformed under her ownership.'],
  ['rc-009-1', 'EMP-009', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 3, 'Good first year; ramping well on ScoutIQ.'],
  ['rc-010-1', 'EMP-010', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 4, 'Fast ramp-up; strong frontend instincts.'],
  ['rc-011-1', 'EMP-011', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 3, 'Learning quickly; needs more production exposure.'],
  ['rc-012-1', 'EMP-012', 'Annual Review 2025', '2025-11-03', '2025-12-19', 'completed', 3, 'Capable but inconsistent focus; goals set for 2026.'],
  ['rc-002-2', 'EMP-002', 'Mid-Year Review 2026', '2026-06-01', '2026-07-10', 'completed', 5, 'RFC progressing well; strong team leadership.'],
  ['rc-003-2', 'EMP-003', 'Mid-Year Review 2026', '2026-06-08', '2026-07-17', 'completed', 4, 'Cost work on track; good mentorship of Alex.'],
  ['rc-004-2', 'EMP-004', 'Mid-Year Review 2026', '2026-06-15', '2026-07-24', 'completed', 4, 'v2 planning solid; certification completed.'],
  ['rc-005-2', 'EMP-005', 'Mid-Year Review 2026', '2026-06-22', '2026-07-31', 'completed', 5, 'Testing overhaul ahead of schedule.'],
  ['rc-006-2', 'EMP-006', 'Mid-Year Review 2026', '2026-07-06', '2026-08-14', 'in_progress', '', 'Focus: delivery consistency and accessibility goal.'],
  ['rc-007-2', 'EMP-007', 'Mid-Year Review 2026', '2026-07-13', '2026-08-21', 'in_progress', '', ''],
  ['rc-008-2', 'EMP-008', 'Mid-Year Review 2026', '2026-07-20', '2026-08-28', 'in_progress', '', ''],
  ['rc-009-2', 'EMP-009', 'Mid-Year Review 2026', '2026-07-27', '2026-09-04', 'in_progress', '', ''],
  ['rc-010-2', 'EMP-010', 'Mid-Year Review 2026', '2026-08-17', '2026-09-25', 'not_started', '', ''],
  ['rc-011-2', 'EMP-011', 'Mid-Year Review 2026', '2026-08-24', '2026-10-02', 'not_started', '', ''],
  ['rc-012-2', 'EMP-012', 'Mid-Year Review 2026', '2026-08-31', '2026-10-09', 'not_started', '', ''],
  ['rc-002-3', 'EMP-002', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-003-3', 'EMP-003', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-004-3', 'EMP-004', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-005-3', 'EMP-005', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-006-3', 'EMP-006', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-007-3', 'EMP-007', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-008-3', 'EMP-008', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-009-3', 'EMP-009', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-010-3', 'EMP-010', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-011-3', 'EMP-011', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
  ['rc-012-3', 'EMP-012', 'H2 Review 2026', '2026-10-26', '2026-12-18', 'not_started', '', ''],
];

// Continuous check-ins (quarterly) + assorted skill/performance/learning feedback.
// Kavya, Rohan, Alex, and Liam are intentionally overdue so dashboard nudges show.
const feedback: Cell[][] = [
  // id, employeeId, authorId, date, type, skill, goalId, goalType, text, rating
  ['fb-p-1', 'EMP-002', 'EMP-001', '2026-02-06', 'continuous', '', '', '', 'Q1 check-in: strong start on the RFC; keep pushing delegation to seniors.', 4],
  ['fb-p-2', 'EMP-002', 'EMP-001', '2026-05-08', 'continuous', '', '', '', 'Q2 check-in: RFC nearly through review; team morale high.', 5],
  ['fb-p-3', 'EMP-002', 'EMP-001', '2026-06-20', 'performance', '', 'ig-priya-2', 'individual', 'Delegation of the fixtures roadmap slice to Arjun was handled cleanly — clear scope, good guardrails.', ''],
  ['fb-d-1', 'EMP-003', 'EMP-001', '2026-02-13', 'continuous', '', '', '', 'Q1 check-in: pipeline cost analysis is thorough; watch team load balance.', 4],
  ['fb-d-2', 'EMP-003', 'EMP-001', '2026-05-15', 'continuous', '', '', '', 'Q2 check-in: 12% cost reduction landed; on track for the 25% goal.', 4],
  ['fb-d-3', 'EMP-003', 'EMP-001', '2026-04-02', 'skill', 'Kubernetes', 'ig-daniel-1', 'individual', 'Spot-instance migration design showed deep K8s scheduling knowledge.', ''],
  ['fb-n-1', 'EMP-004', 'EMP-001', '2026-03-06', 'continuous', '', '', '', 'Q1 check-in: v2 scoping is crisp; cert study on schedule.', 4],
  ['fb-n-2', 'EMP-004', 'EMP-001', '2026-06-05', 'continuous', '', '', '', 'Q2 check-in: certification done, migration plan reviewed.', 4],
  ['fb-n-3', 'EMP-004', 'EMP-001', '2026-06-08', 'learning', '', 'ig-nina-2', 'individual', 'AWS SA certification completed — already applying it to the LeaguePulse infra review.', ''],
  ['fb-a-1', 'EMP-005', 'EMP-002', '2026-04-10', 'continuous', '', '', '', 'Q1 check-in: guild talk landed very well; testing overhaul kicked off.', 5],
  ['fb-a-2', 'EMP-005', 'EMP-002', '2026-07-10', 'continuous', '', '', '', 'Q2 check-in: CI flake rate already down 40%; operating at lead scope.', 5],
  ['fb-a-3', 'EMP-005', 'EMP-002', '2026-05-18', 'performance', '', 'ig-arjun-2', 'individual', 'The layered test strategy doc is the clearest technical writing on the team this year.', ''],
  ['fb-r-1', 'EMP-006', 'EMP-002', '2026-03-02', 'continuous', '', '', '', 'Q1 check-in: two sprint commitments slipped; agreed on smaller task breakdowns.', 2],
  ['fb-r-2', 'EMP-006', 'EMP-002', '2026-05-20', 'performance', '', '', '', 'Sprint delivery improved after the breakdown change, but estimation still runs optimistic.', ''],
  ['fb-r-3', 'EMP-006', 'EMP-002', '2026-06-14', 'skill', 'CSS', 'ig-rohan-1', 'individual', 'Accessibility audit work shows real care — the contrast fixes were well executed.', ''],
  ['fb-m-1', 'EMP-007', 'EMP-003', '2026-04-17', 'continuous', '', '', '', 'Q1 check-in: dashboard design approved; good stakeholder handling.', 4],
  ['fb-m-2', 'EMP-007', 'EMP-003', '2026-07-17', 'continuous', '', '', '', 'Q2 check-in: freshness monitors live; completeness checks next.', 4],
  ['fb-s-1', 'EMP-008', 'EMP-003', '2026-04-24', 'continuous', '', '', '', 'Q1 check-in: failover design draft is excellent; schedule the game-day.', 5],
  ['fb-s-2', 'EMP-008', 'EMP-003', '2026-07-24', 'continuous', '', '', '', 'Q2 check-in: game-day ran clean; write-up shared org-wide.', 5],
  ['fb-s-3', 'EMP-008', 'EMP-003', '2026-06-30', 'skill', 'Terraform', 'ig-sofia-1', 'individual', 'Multi-region modules are reusable and well documented — other teams are adopting them.', ''],
  ['fb-x-1', 'EMP-009', 'EMP-003', '2026-05-01', 'continuous', '', '', '', 'Q1 check-in: report automation shipped; picking up SQL depth fast.', 3],
  ['fb-x-2', 'EMP-009', 'EMP-003', '2026-06-12', 'learning', '', 'ig-alex-1', 'individual', 'Pipeline automation project taught him scheduling and idempotency patterns — visible growth.', ''],
  ['fb-k-1', 'EMP-010', 'EMP-005', '2026-01-19', 'continuous', '', '', '', 'Q1 check-in: ramping quickly; pairing sessions going well.', 4],
  ['fb-k-2', 'EMP-010', 'EMP-005', '2026-04-20', 'continuous', '', '', '', 'Q2 check-in: notification center design approved; confidence growing.', 4],
  ['fb-k-3', 'EMP-010', 'EMP-005', '2026-06-11', 'skill', 'React', 'ig-kavya-1', 'individual', 'Notification center components are cleanly composed with strong test coverage.', ''],
  ['fb-k-4', 'EMP-010', 'EMP-005', '2026-07-02', 'learning', '', 'ig-kavya-2', 'individual', 'Applying generics from the TS course in the API layer — code reads much safer now.', ''],
  ['fb-e-1', 'EMP-011', 'EMP-008', '2026-05-22', 'continuous', '', '', '', 'Q1 check-in: solid Docker fundamentals; CI ownership handover started.', 3],
  ['fb-e-2', 'EMP-011', 'EMP-008', '2026-07-08', 'skill', 'CI/CD', 'ig-ethan-1', 'individual', 'Build-time profiling found the two slowest stages — 18% faster already.', ''],
  ['fb-l-1', 'EMP-012', 'EMP-004', '2026-02-27', 'continuous', '', '', '', 'Q1 check-in: flaky-test goal agreed; needs steadier daily focus.', 3],
  ['fb-l-2', 'EMP-012', 'EMP-004', '2026-06-03', 'performance', '', '', '', 'Missed the quarantine-tooling kickoff twice; re-planned with explicit milestones.', ''],
];

// Quarterly skill/will snapshots (1-10)
const skillWill: Cell[][] = [
  // id, employeeId, date, skill, will, notes
  ['sw-002-1', 'EMP-002', '2026-01-12', 8, 9, ''], ['sw-002-2', 'EMP-002', '2026-04-13', 9, 9, ''], ['sw-002-3', 'EMP-002', '2026-07-13', 9, 9, 'Ready for more org-level scope.'],
  ['sw-003-1', 'EMP-003', '2026-01-12', 8, 7, ''], ['sw-003-2', 'EMP-003', '2026-04-13', 8, 8, ''], ['sw-003-3', 'EMP-003', '2026-07-13', 9, 8, ''],
  ['sw-004-1', 'EMP-004', '2026-01-12', 7, 8, ''], ['sw-004-2', 'EMP-004', '2026-04-13', 8, 8, ''], ['sw-004-3', 'EMP-004', '2026-07-13', 8, 9, 'v2 launch is energizing her.'],
  ['sw-005-1', 'EMP-005', '2026-01-12', 7, 9, ''], ['sw-005-2', 'EMP-005', '2026-04-13', 8, 9, ''], ['sw-005-3', 'EMP-005', '2026-07-13', 8, 10, 'Lead promotion case building.'],
  ['sw-006-1', 'EMP-006', '2026-01-12', 4, 5, ''], ['sw-006-2', 'EMP-006', '2026-04-13', 4, 4, 'Motivation dipped after slipped sprints.'], ['sw-006-3', 'EMP-006', '2026-07-13', 5, 6, 'A11y goal re-engaged him.'],
  ['sw-007-1', 'EMP-007', '2026-01-12', 7, 7, ''], ['sw-007-2', 'EMP-007', '2026-04-13', 7, 8, ''], ['sw-007-3', 'EMP-007', '2026-07-13', 8, 8, ''],
  ['sw-008-1', 'EMP-008', '2026-01-12', 9, 8, ''], ['sw-008-2', 'EMP-008', '2026-04-13', 9, 9, ''], ['sw-008-3', 'EMP-008', '2026-07-13', 9, 9, ''],
  ['sw-009-1', 'EMP-009', '2026-01-12', 5, 8, ''], ['sw-009-2', 'EMP-009', '2026-04-13', 6, 8, ''], ['sw-009-3', 'EMP-009', '2026-07-13', 6, 9, ''],
  ['sw-010-1', 'EMP-010', '2026-01-12', 5, 9, ''], ['sw-010-2', 'EMP-010', '2026-04-13', 6, 9, ''], ['sw-010-3', 'EMP-010', '2026-07-13', 7, 10, 'Fastest ramp on the team.'],
  ['sw-011-1', 'EMP-011', '2026-01-12', 5, 7, ''], ['sw-011-2', 'EMP-011', '2026-04-13', 6, 7, ''], ['sw-011-3', 'EMP-011', '2026-07-13', 6, 8, ''],
  ['sw-012-1', 'EMP-012', '2026-01-12', 5, 6, ''], ['sw-012-2', 'EMP-012', '2026-04-13', 5, 5, ''], ['sw-012-3', 'EMP-012', '2026-07-13', 6, 6, ''],
];

export async function seed(): Promise<void> {
  const passwordHash = hashPassword(PASSWORD);
  const sheets: Record<string, SheetSpec> = {
    Employees: { headers: employeeHeaders, rows: people.map((p) => [...p, passwordHash]) },
    Columns: { headers: ['key', 'label', 'type', 'options', 'core', 'visible', 'order'], rows: columnRows },
    DesignationGoals: { headers: ['id', 'designation', 'title', 'description', 'category'], rows: designationGoals },
    IndividualGoals: { headers: ['id', 'employeeId', 'title', 'description', 'category', 'status', 'targetDate'], rows: individualGoals },
    ReviewCycles: { headers: ['id', 'employeeId', 'name', 'startDate', 'endDate', 'status', 'rating', 'notes'], rows: reviewCycles },
    Feedback: { headers: ['id', 'employeeId', 'authorId', 'date', 'type', 'skill', 'goalId', 'goalType', 'text', 'rating'], rows: feedback },
    SkillWill: { headers: ['id', 'employeeId', 'date', 'skill', 'will', 'notes'], rows: skillWill },
  };

  const wb = new ExcelJS.Workbook();
  for (const [name, spec] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    ws.addRow(spec.headers);
    ws.getRow(1).font = { bold: true };
    for (const row of spec.rows) ws.addRow(row);
    ws.columns.forEach((col, i) => {
      col.width = Math.max(14, (spec.headers[i] ?? '').length + 6);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  await wb.xlsx.writeFile(DATA_PATH);
  console.log(`Seeded ${DATA_PATH} (all demo logins use password "${PASSWORD}")`);
}

// Run directly: npm run seed
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
