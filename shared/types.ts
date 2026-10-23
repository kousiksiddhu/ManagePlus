// Shared domain types used by both the Express API (server/) and the React client (src/).
// The Excel workbook at data/manageplus.xlsx is the source of truth; these types
// mirror its sheets.

export type Role = 'employee' | 'manager' | 'admin';

export type GoalStatus = 'not_started' | 'in_progress' | 'completed';
export type ReviewStatus = 'not_started' | 'in_progress' | 'completed';
export type FeedbackType = 'skill' | 'learning' | 'performance' | 'continuous';

/** A row of the Employees sheet. Custom columns appear as extra string keys. */
export interface Employee {
  employeeId: string;
  name: string;
  email: string;
  designation: string;
  /** employeeId of this person's mentor/manager; '' for top-level people. */
  mentorId: string;
  currentProject: string;
  /** "; " separated list, most recent first. */
  projectHistory: string;
  /** ", " separated list. */
  skills: string;
  /** e.g. On Track | Exceeding | Needs Attention */
  growthStatus: string;
  /** YYYY-MM-DD */
  joinDate: string;
  [customKey: string]: string | number | boolean | null | undefined;
}

/** Employee as returned by the API — passwordHash stripped, role computed. */
export interface EmployeeOut extends Employee {
  role: Role;
  hasMentees: boolean;
}

export interface TreeNode {
  employee: EmployeeOut;
  children: TreeNode[];
}

/** A row of the Columns sheet — defines what the team list view shows. */
export interface ColumnDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'tags' | 'select';
  /** comma-separated choices, only for type 'select' */
  options: string;
  /** core columns map to fixed Employee fields and cannot be deleted */
  core: boolean;
  visible: boolean;
  order: number;
}

export interface DesignationGoal {
  id: string;
  designation: string;
  title: string;
  description: string;
  category: string;
}

export interface IndividualGoal {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  category: string;
  status: GoalStatus;
  /** YYYY-MM-DD */
  targetDate: string;
}

export interface ReviewCycle {
  id: string;
  employeeId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ReviewStatus;
  /** 1-5, null until completed */
  rating: number | null;
  notes: string;
}

export interface ReviewCycleOut extends ReviewCycle {
  employeeName: string;
  designation: string;
}

export interface Feedback {
  id: string;
  employeeId: string;
  authorId: string;
  /** YYYY-MM-DD */
  date: string;
  type: FeedbackType;
  /** skill name for type 'skill', '' otherwise */
  skill: string;
  /** id of the goal this is tagged under; null = general feedback */
  goalId: string | null;
  goalType: 'individual' | 'designation' | null;
  text: string;
  /** 1-5, used for continuous check-ins (and optionally performance) */
  rating: number | null;
}

export interface FeedbackOut extends Feedback {
  authorName: string;
  /** resolved title of the tagged goal, null for general feedback */
  goalTitle: string | null;
}

export interface SkillWillEntry {
  id: string;
  employeeId: string;
  /** YYYY-MM-DD */
  date: string;
  /** 1-10 */
  skill: number;
  /** 1-10 */
  will: number;
  notes: string;
}

/** Continuous-feedback cadence: a check-in is due every N months. */
export const CHECKIN_INTERVAL_MONTHS = 3;

export interface CheckinStatus {
  /** date of the last continuous-feedback entry, null if never */
  lastCheckin: string | null;
  /** when the next check-in is due (last + 3 months, or joinDate + 3 months) */
  dueDate: string;
  /** positive = overdue by N days, negative = due in N days */
  overdueDays: number;
}

export interface CheckinNudge extends CheckinStatus {
  employee: EmployeeOut;
}

export const GROWTH_STATUSES = ['On Track', 'Exceeding', 'Needs Attention'] as const;

export const DEFAULT_DESIGNATIONS = [
  'Associate Engineer',
  'Senior Engineer',
  'Lead Engineer',
  'Engineering Manager',
] as const;

/** Fields of the Employees sheet that are managed by the app and never shown as list columns. */
export const INTERNAL_EMPLOYEE_FIELDS = ['passwordHash', 'isAdmin'] as const;
