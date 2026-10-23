// Excel-backed data store. The workbook at data/manageplus.xlsx is the single
// source of truth: every mutation is written straight back to the file, and the
// file's mtime is checked before reads so edits made directly in Excel are
// picked up automatically.
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  CheckinStatus,
  ColumnDef,
  DesignationGoal,
  Employee,
  EmployeeOut,
  Feedback,
  IndividualGoal,
  ReviewCycle,
  Role,
  SkillWillEntry,
  TreeNode,
} from '../shared/types';
import { CHECKIN_INTERVAL_MONTHS } from '../shared/types';

export const DATA_PATH = process.env.EXCEL_PATH ?? path.resolve('data/manageplus.xlsx');

export const SHEETS = {
  employees: 'Employees',
  columns: 'Columns',
  designationGoals: 'DesignationGoals',
  individualGoals: 'IndividualGoals',
  reviewCycles: 'ReviewCycles',
  feedback: 'Feedback',
  skillWill: 'SkillWill',
} as const;

export type Row = Record<string, string | number | boolean | null>;

interface SheetData {
  headers: string[];
  rows: Row[];
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Excel date cells come back from exceljs as UTC-midnight Dates; read them in UTC
 *  so the calendar date never shifts for negative-offset timezones. */
function isoDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return isoDate(date);
}

/** Flatten the many shapes an exceljs cell value can take into a plain scalar. */
function normalizeCell(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return isoDateUTC(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && value.text != null) return String(value.text);
    if ('result' in value && value.result != null) return normalizeCell(value.result as ExcelJS.CellValue);
    if ('hyperlink' in value) return String(value.hyperlink);
  }
  return String(value);
}

function asString(v: string | number | boolean | null | undefined): string {
  return v == null ? '' : String(v);
}

function asNumberOrNull(v: string | number | boolean | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: string | number | boolean | null | undefined): boolean {
  if (typeof v === 'boolean') return v;
  const s = asString(v).toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}

class ExcelStore {
  private sheets = new Map<string, SheetData>();
  private mtime = -1;
  private writeQueue: Promise<void> = Promise.resolve();

  /** Reload from disk if the workbook changed (e.g. edited directly in Excel). */
  async ready(): Promise<void> {
    // Never reload while one of our own saves is mid-write to the file.
    await this.writeQueue.catch(() => {});
    const stat = fs.statSync(DATA_PATH);
    if (stat.mtimeMs !== this.mtime) await this.load();
  }

  async load(): Promise<void> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA_PATH);
    this.sheets.clear();
    wb.eachSheet((ws) => {
      const headers: string[] = [];
      ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
        headers[col - 1] = asString(normalizeCell(cell.value));
      });
      const rows: Row[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const r: Row = {};
        headers.forEach((h, i) => {
          if (!h) return;
          r[h] = normalizeCell(row.getCell(i + 1).value);
        });
        if (Object.values(r).some((v) => v !== null && v !== '')) rows.push(r);
      });
      this.sheets.set(ws.name, { headers: headers.filter(Boolean), rows });
    });
    this.mtime = fs.statSync(DATA_PATH).mtimeMs;
  }

  /** Persist the in-memory sheets back to the workbook. Writes are serialized;
   *  a failed write surfaces to its caller without poisoning the queue. */
  private async save(): Promise<void> {
    const run = this.writeQueue.catch(() => {}).then(async () => {
      const wb = new ExcelJS.Workbook();
      for (const [name, data] of this.sheets) {
        const ws = wb.addWorksheet(name);
        ws.addRow(data.headers);
        ws.getRow(1).font = { bold: true };
        for (const row of data.rows) {
          ws.addRow(data.headers.map((h) => row[h] ?? ''));
        }
        ws.columns.forEach((col, i) => {
          col.width = Math.max(14, (data.headers[i] ?? '').length + 6);
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
      }
      await wb.xlsx.writeFile(DATA_PATH);
      this.mtime = fs.statSync(DATA_PATH).mtimeMs;
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private sheet(name: string): SheetData {
    const s = this.sheets.get(name);
    if (!s) throw new Error(`Sheet not found in workbook: ${name}`);
    return s;
  }

  // ---- generic sheet CRUD ------------------------------------------------

  list(sheetName: string): Row[] {
    return this.sheet(sheetName).rows.map((r) => ({ ...r }));
  }

  findRow(sheetName: string, id: string, idField = 'id'): Row | undefined {
    const r = this.sheet(sheetName).rows.find((row) => asString(row[idField]) === id);
    return r ? { ...r } : undefined;
  }

  async insertRow(sheetName: string, row: Row): Promise<void> {
    const sheet = this.sheet(sheetName);
    for (const key of Object.keys(row)) {
      if (!sheet.headers.includes(key)) sheet.headers.push(key);
    }
    sheet.rows.push({ ...row });
    await this.save();
  }

  async updateRow(sheetName: string, id: string, patch: Row, idField = 'id'): Promise<Row> {
    const sheet = this.sheet(sheetName);
    const row = sheet.rows.find((r) => asString(r[idField]) === id);
    if (!row) throw new Error(`Row ${id} not found in ${sheetName}`);
    for (const [key, value] of Object.entries(patch)) {
      if (!sheet.headers.includes(key)) sheet.headers.push(key);
      row[key] = value;
    }
    await this.save();
    return { ...row };
  }

  async removeRow(sheetName: string, id: string, idField = 'id'): Promise<void> {
    const sheet = this.sheet(sheetName);
    const idx = sheet.rows.findIndex((r) => asString(r[idField]) === id);
    if (idx === -1) throw new Error(`Row ${id} not found in ${sheetName}`);
    sheet.rows.splice(idx, 1);
    await this.save();
  }

  async removeRowsWhere(sheetName: string, predicate: (row: Row) => boolean): Promise<void> {
    const sheet = this.sheet(sheetName);
    sheet.rows = sheet.rows.filter((r) => !predicate(r));
    await this.save();
  }

  // ---- employees ---------------------------------------------------------

  /** Raw employee rows, including internal fields (passwordHash, isAdmin). */
  employeeRows(): Row[] {
    return this.list(SHEETS.employees);
  }

  employees(): EmployeeOut[] {
    return this.employeeRows().map((r) => this.toOut(r));
  }

  getEmployee(employeeId: string): EmployeeOut | undefined {
    const row = this.findRow(SHEETS.employees, employeeId, 'employeeId');
    return row ? this.toOut(row) : undefined;
  }

  getEmployeeRow(employeeId: string): Row | undefined {
    return this.findRow(SHEETS.employees, employeeId, 'employeeId');
  }

  getByEmail(email: string): Row | undefined {
    const target = email.trim().toLowerCase();
    const row = this.sheet(SHEETS.employees).rows.find(
      (r) => asString(r.email).trim().toLowerCase() === target,
    );
    return row ? { ...row } : undefined;
  }

  hasMentees(employeeId: string): boolean {
    return this.sheet(SHEETS.employees).rows.some((r) => asString(r.mentorId) === employeeId);
  }

  roleOf(row: Row): Role {
    if (asBool(row.isAdmin)) return 'admin';
    return this.hasMentees(asString(row.employeeId)) ? 'manager' : 'employee';
  }

  /** Strip internal fields and add computed role info. Empty cells become ''
   *  (never null) and ids are always strings, so hand-edited or numeric Excel
   *  cells can't break client code. */
  toOut(row: Row): EmployeeOut {
    const { passwordHash: _ph, ...rest } = row;
    const clean: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(rest)) clean[key] = value ?? '';
    return {
      ...(clean as unknown as Employee),
      employeeId: asString(row.employeeId),
      mentorId: asString(row.mentorId),
      isAdmin: asBool(row.isAdmin) ? 'yes' : 'no',
      role: this.roleOf(row),
      hasMentees: this.hasMentees(asString(row.employeeId)),
    };
  }

  directReports(employeeId: string): EmployeeOut[] {
    return this.employeeRows()
      .filter((r) => asString(r.mentorId) === employeeId)
      .map((r) => this.toOut(r));
  }

  /** All descendant employeeIds (children, grandchildren, ...), excluding self. */
  subtreeIds(employeeId: string): string[] {
    const byMentor = new Map<string, string[]>();
    for (const r of this.sheet(SHEETS.employees).rows) {
      const mentor = asString(r.mentorId);
      if (!byMentor.has(mentor)) byMentor.set(mentor, []);
      byMentor.get(mentor)!.push(asString(r.employeeId));
    }
    // visited-guard: a mentorId cycle hand-typed into Excel must not hang the server
    const out: string[] = [];
    const seen = new Set<string>([employeeId]);
    const queue = [...(byMentor.get(employeeId) ?? [])];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      queue.push(...(byMentor.get(id) ?? []));
    }
    return out;
  }

  /** ids visible to an actor: self + full subtree (admin sees everyone). */
  visibleIds(actor: EmployeeOut): string[] {
    if (actor.role === 'admin') return this.employeeRows().map((r) => asString(r.employeeId));
    return [actor.employeeId, ...this.subtreeIds(actor.employeeId)];
  }

  buildTree(rootId: string): TreeNode | null {
    const root = this.getEmployee(rootId);
    if (!root) return null;
    const seen = new Set<string>();
    const build = (emp: EmployeeOut): TreeNode => {
      seen.add(emp.employeeId);
      return {
        employee: emp,
        children: this.directReports(emp.employeeId)
          .filter((c) => !seen.has(c.employeeId))
          .map(build),
      };
    };
    return build(root);
  }

  private metaSheet(): SheetData {
    let meta = this.sheets.get('Meta');
    if (!meta) {
      meta = { headers: ['key', 'value'], rows: [] };
      this.sheets.set('Meta', meta);
    }
    return meta;
  }

  private setMeta(key: string, value: string | number): void {
    const meta = this.metaSheet();
    const row = meta.rows.find((r) => asString(r.key) === key);
    if (row) row.value = value;
    else meta.rows.push({ key, value });
  }

  /**
   * Monotonic id generation backed by a Meta-sheet high-water mark, so ids of
   * deleted employees are never recycled (recycling would re-bind their old
   * sessions and historical rows to a new person).
   */
  nextEmployeeId(): string {
    let max = 0;
    const rows = this.sheet(SHEETS.employees).rows;
    for (const r of rows) {
      const m = asString(r.employeeId).match(/(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const metaRow = this.metaSheet().rows.find((r) => asString(r.key) === 'lastEmployeeSeq');
    const stored = metaRow ? asNumberOrNull(metaRow.value) : null;
    const next = Math.max(max, stored ?? 0) + 1;
    this.setMeta('lastEmployeeSeq', next); // persisted by the insert's save()
    const mostlyBare = rows.filter((r) => /^\d+$/.test(asString(r.employeeId))).length > rows.length / 2;
    return mostlyBare ? String(next) : `EMP-${String(next).padStart(3, '0')}`;
  }

  async insertEmployee(row: Row): Promise<EmployeeOut> {
    await this.insertRow(SHEETS.employees, row);
    return this.getEmployee(asString(row.employeeId))!;
  }

  async updateEmployee(employeeId: string, patch: Row): Promise<EmployeeOut> {
    delete patch.passwordHash; // never writable through the API
    const row = await this.updateRow(SHEETS.employees, employeeId, patch, 'employeeId');
    return this.toOut(row);
  }

  /**
   * Delete an employee. Their mentees are re-parented to the deleted person's
   * mentor, and their goals/reviews/feedback/skill-will rows are removed.
   */
  async deleteEmployee(employeeId: string): Promise<void> {
    const row = this.getEmployeeRow(employeeId);
    if (!row) throw new Error(`Employee ${employeeId} not found`);
    const newMentor = asString(row.mentorId);
    const sheet = this.sheet(SHEETS.employees);
    for (const r of sheet.rows) {
      if (asString(r.mentorId) === employeeId) r.mentorId = newMentor;
    }
    const idx = sheet.rows.findIndex((r) => asString(r.employeeId) === employeeId);
    sheet.rows.splice(idx, 1);
    for (const name of [SHEETS.individualGoals, SHEETS.reviewCycles, SHEETS.feedback, SHEETS.skillWill]) {
      this.sheet(name).rows = this.sheet(name).rows.filter(
        (r) => asString(r.employeeId) !== employeeId,
      );
    }
    await this.save();
  }

  // ---- columns -----------------------------------------------------------

  columns(): ColumnDef[] {
    return this.list(SHEETS.columns)
      .map((r) => ({
        key: asString(r.key),
        label: asString(r.label),
        type: (asString(r.type) || 'text') as ColumnDef['type'],
        options: asString(r.options),
        core: asBool(r.core),
        visible: asBool(r.visible),
        order: asNumberOrNull(r.order) ?? 0,
      }))
      .sort((a, b) => a.order - b.order);
  }

  async addColumn(def: { key: string; label: string; type: string; options: string }): Promise<ColumnDef> {
    const cols = this.columns();
    if (cols.some((c) => c.key === def.key)) throw new Error(`Column '${def.key}' already exists`);
    const order = Math.max(0, ...cols.map((c) => c.order)) + 1;
    const empSheet = this.sheet(SHEETS.employees);
    if (!empSheet.headers.includes(def.key)) empSheet.headers.push(def.key);
    for (const r of empSheet.rows) r[def.key] = r[def.key] ?? '';
    this.sheet(SHEETS.columns).rows.push({
      key: def.key,
      label: def.label,
      type: def.type,
      options: def.options,
      core: 'no',
      visible: 'yes',
      order,
    });
    await this.save();
    return this.columns().find((c) => c.key === def.key)!;
  }

  async updateColumn(key: string, patch: Partial<ColumnDef>): Promise<ColumnDef> {
    const row = this.sheet(SHEETS.columns).rows.find((r) => asString(r.key) === key);
    if (!row) throw new Error(`Column '${key}' not found`);
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.options !== undefined) row.options = patch.options;
    if (patch.visible !== undefined) row.visible = patch.visible ? 'yes' : 'no';
    if (patch.order !== undefined) row.order = patch.order;
    await this.save();
    return this.columns().find((c) => c.key === key)!;
  }

  async removeColumn(key: string): Promise<void> {
    const col = this.columns().find((c) => c.key === key);
    if (!col) throw new Error(`Column '${key}' not found`);
    if (col.core) throw new Error(`Column '${key}' is a core column and cannot be removed`);
    const colSheet = this.sheet(SHEETS.columns);
    colSheet.rows = colSheet.rows.filter((r) => asString(r.key) !== key);
    const empSheet = this.sheet(SHEETS.employees);
    empSheet.headers = empSheet.headers.filter((h) => h !== key);
    for (const r of empSheet.rows) delete r[key];
    await this.save();
  }

  // ---- typed entity getters ----------------------------------------------

  designationGoals(): DesignationGoal[] {
    return this.list(SHEETS.designationGoals).map((r) => ({
      id: asString(r.id),
      designation: asString(r.designation),
      title: asString(r.title),
      description: asString(r.description),
      category: asString(r.category),
    }));
  }

  individualGoals(): IndividualGoal[] {
    return this.list(SHEETS.individualGoals).map((r) => ({
      id: asString(r.id),
      employeeId: asString(r.employeeId),
      title: asString(r.title),
      description: asString(r.description),
      category: asString(r.category),
      status: (asString(r.status) || 'not_started') as IndividualGoal['status'],
      targetDate: asString(r.targetDate),
    }));
  }

  reviewCycles(): ReviewCycle[] {
    return this.list(SHEETS.reviewCycles).map((r) => ({
      id: asString(r.id),
      employeeId: asString(r.employeeId),
      name: asString(r.name),
      startDate: asString(r.startDate),
      endDate: asString(r.endDate),
      status: (asString(r.status) || 'not_started') as ReviewCycle['status'],
      rating: asNumberOrNull(r.rating),
      notes: asString(r.notes),
    }));
  }

  feedback(): Feedback[] {
    return this.list(SHEETS.feedback).map((r) => ({
      id: asString(r.id),
      employeeId: asString(r.employeeId),
      authorId: asString(r.authorId),
      date: asString(r.date),
      type: (asString(r.type) || 'performance') as Feedback['type'],
      skill: asString(r.skill),
      goalId: asString(r.goalId) || null,
      goalType: (asString(r.goalType) || null) as Feedback['goalType'],
      text: asString(r.text),
      rating: asNumberOrNull(r.rating),
    }));
  }

  skillWill(): SkillWillEntry[] {
    return this.list(SHEETS.skillWill).map((r) => ({
      id: asString(r.id),
      employeeId: asString(r.employeeId),
      date: asString(r.date),
      skill: asNumberOrNull(r.skill) ?? 0,
      will: asNumberOrNull(r.will) ?? 0,
      notes: asString(r.notes),
    }));
  }

  /** Resolve a goal id to its title, checking both goal sheets. */
  goalTitle(goalId: string | null): string | null {
    if (!goalId) return null;
    const ig = this.individualGoals().find((g) => g.id === goalId);
    if (ig) return ig.title;
    const dg = this.designationGoals().find((g) => g.id === goalId);
    return dg ? dg.title : null;
  }

  /** Continuous-feedback (quarterly check-in) status for one employee. */
  checkinStatus(employeeId: string, today = new Date()): CheckinStatus {
    const checkins = this.feedback()
      .filter((f) => f.employeeId === employeeId && f.type === 'continuous')
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const emp = this.getEmployee(employeeId);
    const lastCheckin = checkins[0]?.date ?? null;
    const base = lastCheckin ?? (emp?.joinDate || isoDate(today));
    const dueDate = addMonths(base, CHECKIN_INTERVAL_MONTHS);
    const msPerDay = 24 * 60 * 60 * 1000;
    const overdueDays = Math.floor(
      (new Date(isoDate(today)).getTime() - new Date(dueDate).getTime()) / msPerDay,
    );
    return { lastCheckin, dueDate, overdueDays };
  }
}

export const store = new ExcelStore();
