// Imports the 10x review history export + the AI-delivery goals framework
// into data/manageplus.xlsx. Re-runnable: rebuilds ReviewCycles / Feedback /
// SkillWill / IndividualGoals / DesignationGoals while preserving Employees
// (and every other sheet) exactly as-is, apart from two added custom columns
// (US Employee ID, Practice Head) and growth-status updates derived from the
// latest 10x final rating.
// Run: npx tsx server/import-10x.ts
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { DATA_PATH } from './store';

const REFERENCE_PATH = path.resolve('data/Siddhu Nallasivam - 10x history.xlsx');
const TODAY = '2026-08-10';
const NOTES_CHAR_LIMIT = 30000;

type Cell = string | number;
type Row = Record<string, Cell>;

function cellVal(v: ExcelJS.CellValue): Cell {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v && v.text != null) return String(v.text);
    if ('result' in v && v.result != null) return cellVal(v.result as ExcelJS.CellValue);
    if ('hyperlink' in v) return String(v.hyperlink);
  }
  return String(v);
}

function readSheet(ws: ExcelJS.Worksheet): { headers: string[]; rows: Row[] } {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => {
    headers[i - 1] = String(cellVal(c.value));
  });
  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Row = {};
    headers.forEach((h, i) => {
      if (h) r[h] = cellVal(row.getCell(i + 1).value);
    });
    if (Object.values(r).some((v) => v !== '' && v != null)) rows.push(r);
  });
  return { headers: headers.filter(Boolean), rows };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthIndex(name: string): number {
  return MONTHS.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());
}

function lastDayOfMonth(year: number, monthIdx: number): string {
  const d = new Date(Date.UTC(year, monthIdx + 1, 0));
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}

/**
 * "Q1_2022" -> quarterly review held at the end of that quarter;
 * "February 2026_1" -> annual review held at the end of the appraisal month.
 * Reviews are single-date events (start === end), drawn as compact pills at
 * quarter end on the calendar — not range bars.
 */
function parseCycle(cycle: string): { kind: 'annual' | 'quarterly'; name: string; label: string; date: string; sortKey: string } | null {
  const q = cycle.match(/^Q([1-4])_(\d{4})$/);
  if (q) {
    const [, qn, ys] = q;
    const year = Number(ys);
    const endMonth = (Number(qn) - 1) * 3 + 2;
    return {
      kind: 'quarterly',
      name: `Q${qn} Review`,
      label: `Q${qn} ${year}`,
      date: lastDayOfMonth(year, endMonth),
      sortKey: `${year}-${String(endMonth + 1).padStart(2, '0')}`,
    };
  }
  const m = cycle.match(/^([A-Za-z]+)\s+(\d{4})(?:_\d+)?$/);
  if (m) {
    const [, monthName, ys] = m;
    const year = Number(ys);
    const mi = monthIndex(monthName);
    if (mi === -1) return null;
    return {
      kind: 'annual',
      name: 'Annual Review',
      label: `${MONTHS[mi]} ${year}`,
      date: lastDayOfMonth(year, mi),
      sortKey: `${year}-${String(mi + 1).padStart(2, '0')}`,
    };
  }
  return null;
}

function ratingTo5(label: string): number | '' {
  const l = label.trim().toLowerCase();
  if (l === 'leading the way') return 5;
  if (l === 'moving ahead') return 4;
  if (l === 'right on track') return 3;
  return '';
}

function ratingTo10(label: string): number | null {
  const l = label.trim().toLowerCase();
  if (l === 'leading the way') return 9;
  if (l === 'moving ahead') return 8;
  if (l === 'right on track') return 6;
  return null;
}

// Designation goal library from "AI-Enabled Engineering Goals & Objectives
// Framework" (data/engineering_goals_objectives_ai_delivery_framework_with_
// engineering_manager (1).pdf). One goal per weighted goal area per role;
// descriptions carry the role's objective + key results. Per the framework,
// each person then gets ONE custom goal on top (here: their 10x focus areas).
const FRAMEWORK_GOALS: Array<{ designation: string; weight: string; title: string; category: string; description: string }> = [
  // ---- Associate Engineer (45/25/15/5/10) ----
  { designation: 'Associate Engineer', weight: '45%', category: 'Delivery', title: 'Project Delivery & Engineering Excellence',
    description: 'Deliver assigned development, testing, documentation, and support tasks with quality and predictability: complete sprint tasks with 85–90% predictability; write clean, maintainable code to project standards; self-review, unit test, and peer-validate before handoff; understand project architecture, dependencies, and deployment flow; participate actively in ceremonies; raise blockers early; contribute to setup guides, API notes, and runbooks.' },
  { designation: 'Associate Engineer', weight: '25%', category: 'AI Enablement', title: 'AI Enablement & Upskilling',
    description: 'Become AI-enabled in daily engineering execution: complete at least one relevant certification or structured learning path; use approved AI tools for code explanation, test generation, documentation, and debugging; create at least two reusable prompts, snippets, or test templates for the team; use AI responsibly (no confidential data leakage, no blind copy-paste, human validation); join at least one internal AI/GenAI enablement session; show measurable AI-assisted productivity or quality improvement.' },
  { designation: 'Associate Engineer', weight: '15%', category: 'People', title: 'People, Process & Collaboration',
    description: 'Become a dependable team member: follow project processes for Jira/ADO updates, timesheets, commits, pull requests, and status reporting; actively seek feedback from senior engineers and leads; participate in code reviews and incorporate feedback without repeated mistakes; maintain professional communication; contribute at least one learning note or project document per quarter.' },
  { designation: 'Associate Engineer', weight: '5%', category: 'Consulting', title: 'Consulting Mindset & Business Awareness',
    description: 'Understand why the project matters to the client: learn the client domain, basic business workflow, and end-user impact of assigned work; ask clarifying questions before implementation; identify small improvements in validation, logging, usability, or maintainability; explain completed work in simple business terms.' },
  { designation: 'Associate Engineer', weight: '10%', category: 'Compliance', title: 'Utilization & Compliance',
    description: 'Maintain expected utilization and compliance discipline: maintain the assigned utilization target; submit timesheets accurately and on time; complete mandatory security, compliance, and AI-governance trainings; follow secure coding and data-handling practices; keep clean handover notes.' },

  // ---- Engineer (45/20/10/15/10) ----
  { designation: 'Engineer', weight: '45%', category: 'Delivery', title: 'Project Delivery & Engineering Excellence',
    description: 'Independently deliver quality engineering outcomes: own user stories/components from requirement clarification through development, testing, deployment support, and documentation; maintain sprint predictability of 90%+; reduce avoidable rework via better analysis and self-review; contribute to unit/automation testing, CI/CD improvements, and defect prevention; participate in RCA for defects and incidents; improve code quality via static analysis and reviews; support production releases and smooth QA/support handover.' },
  { designation: 'Engineer', weight: '20%', category: 'AI Enablement', title: 'AI Enablement & Automation',
    description: 'Use AI to improve project delivery quality and speed: use approved AI tools for code generation, test generation, documentation, refactoring, debugging, and research; build or contribute to at least one project-level automation or AI-assisted workflow per half-year; maintain examples showing measurable AI impact; create reusable prompts/templates for repetitive activities; complete at least one relevant certification or AI learning path; validate all AI output for correctness, security, and maintainability.' },
  { designation: 'Engineer', weight: '10%', category: 'Consulting', title: 'Consulting Mindset & Client Impact',
    description: 'Move from task execution to solution contribution: understand business requirements and clarify assumptions before implementation; identify improvement opportunities in workflow, usability, performance, or maintainability; support demos, walkthroughs, and technical explanations; communicate risks and dependencies clearly; contribute to delivery-led growth by identifying small enhancements or automation opportunities.' },
  { designation: 'Engineer', weight: '15%', category: 'People', title: 'Team Collaboration & Knowledge Contribution',
    description: 'Support team maturity through collaboration, peer quality practices, and reusable knowledge: provide meaningful peer code reviews and incorporate feedback effectively; share practical project notes, snippets, troubleshooting steps, and learnings; help unblock peers on known modules; support ceremonies, documentation hygiene, and knowledge-base updates; help smooth onboarding with docs and setup notes.' },
  { designation: 'Engineer', weight: '10%', category: 'Compliance', title: 'Utilization & Compliance',
    description: 'Maintain high utilization and process discipline: maintain the utilization target; keep Jira/ADO, timesheets, documentation, and status updates current; complete mandatory trainings and certifications; follow security, privacy, and AI-governance requirements; ensure deliverables are traceable to requirements and acceptance criteria.' },

  // ---- Senior Engineer (45/20/20/10/5) ----
  { designation: 'Senior Engineer', weight: '45%', category: 'Delivery', title: 'Project Delivery & Engineering Excellence',
    description: 'Own complex delivery areas with quality, predictability, and reduced risk: own modules, features, integrations, or workstreams end to end; handle design, implementation, testing, deployment readiness, and support without major escalation; maintain high sprint predictability and reduce defect leakage; improve code quality, logging, observability, test coverage, performance, and reliability; surface technical risks early with mitigation plans; support release planning, production-readiness reviews, and RCA; contribute to architectural decisions in assigned modules.' },
  { designation: 'Senior Engineer', weight: '20%', category: 'AI Enablement', title: 'AI Enablement, Automation & Agentic Contribution',
    description: 'Drive practical AI adoption within the project: implement at least one AI-assisted project improvement (test-generation workflow, documentation assistant, code-review checklist, defect analysis, log summarization, or sprint reporting automation); contribute to agentic development experiments (coding/QA/story-analysis/release-note/support-triage agents); mentor juniors on safe, effective AI usage; measure AI impact in cycle time, quality, or effort saved; complete one advanced certification or learning path; keep AI usage responsible with human review and secure data handling.' },
  { designation: 'Senior Engineer', weight: '20%', category: 'People', title: 'Team Mentorship & Technical Leadership',
    description: 'Improve team capability and delivery maturity: formally mentor 1–2 associate engineers or engineers; conduct code reviews focused on correctness, design, maintainability, and security; identify skill gaps and recommend learning plans; help leads with estimation, task breakdown, planning, and risk identification; run knowledge-sharing sessions on architecture, domain, debugging, or AI usage; give timely performance feedback to leads and managers.' },
  { designation: 'Senior Engineer', weight: '10%', category: 'Consulting', title: 'Consulting Mindset, Client Impact & CSAT/NPS Support',
    description: 'Contribute to client confidence, solution maturity, and positive CSAT/NPS signals: participate in requirement clarification and technical discussions with stakeholders; translate business needs into implementation options; suggest improvements that cut cost or improve performance and maintainability; support client-facing demos and walkthroughs; identify change requests, automation opportunities, and value-add ideas; collect CSAT/NPS-adjacent evidence (appreciation, fewer escalations, faster closure, adoption).' },
  { designation: 'Senior Engineer', weight: '5%', category: 'Compliance', title: 'Utilization & Compliance',
    description: 'Maintain discipline and governance: maintain the utilization target; comply with delivery processes, timesheets, documentation, and security guidelines; support audit readiness and traceability; ensure AI usage follows organizational and client policies.' },

  // ---- Lead Engineer (40/20/20/15/5) ----
  { designation: 'Lead Engineer', weight: '40%', category: 'Delivery', title: 'Project Delivery & Technical Project Management',
    description: 'Lead successful delivery of the assigned team or workstream with predictability and quality: own planning, estimation, execution, risk management, quality, release readiness, and stakeholder communication end to end; maintain sprint/release predictability and reduce delivery surprises; track and improve defect leakage, rework, test coverage, code quality, and incident trends; document technical decisions aligned to architecture; lead RCA for major issues; escalate risks early with options; drive zero-failed-project behaviors (proactive governance, transparent reporting, dependency tracking, quality gates); keep team members effectively utilized on value-generating work.' },
  { designation: 'Lead Engineer', weight: '20%', category: 'AI Enablement', title: 'AI Enablement & Forward Delivery Engineering',
    description: 'Move the team toward AI-enabled, forward-deployed engineering: define and implement a project-level AI enablement plan; identify repetitive delivery activities suitable for AI automation (sprint reporting, test generation, documentation, log analysis, code review, defect triage, release notes); build or sponsor at least one reusable AI/agentic accelerator per year; coach the team on AI-assisted practices; measure adoption via effort saved, faster analysis, improved quality, or reduced cycle time; drive forward-deployment behaviors (fast client feedback loops, prototypes, demos, adoption support); keep AI outputs reviewed and governed.' },
  { designation: 'Lead Engineer', weight: '20%', category: 'People', title: 'Team Mentorship & People Leadership',
    description: 'Build a high-performing engineering team: mentor senior engineers, engineers, and associates; own team-level capability development and skill-gap closure; give regular feedback on performance, quality, ownership, communication, and career growth; prepare team members for next-role readiness; improve onboarding and ramp-up time; flag performance concerns early and partner with managers on resolution; promote engineering discipline in reviews, testing, documentation, estimation, and ownership.' },
  { designation: 'Lead Engineer', weight: '15%', category: 'Consulting', title: 'Consulting, Client Impact, CSAT/NPS & Growth',
    description: 'Become a trusted delivery and technical partner: lead or join client-facing technical discussions, demos, planning, risk reviews, and solution walkthroughs; prioritize client-facing impact over internal enablement as evidence; translate client needs into technical execution plans; identify value-adds, automation ideas, change requests, and modernization opportunities; contribute to account growth through delivery excellence and stakeholder confidence; track CSAT/NPS-adjacent indicators; support pre-sales, estimation, or proposal inputs when requested.' },
  { designation: 'Lead Engineer', weight: '5%', category: 'Compliance', title: 'Compliance, Utilization & Governance',
    description: 'Ensure governance discipline across the team: maintain team utilization targets; ensure accurate timesheets, tracking, documentation, and reporting; ensure mandatory trainings and compliance are completed; enforce secure coding and responsible AI usage; maintain audit-ready project artifacts.' },

  // ---- Engineering Manager (35/20/20/20/5) ----
  { designation: 'Engineering Manager', weight: '35%', category: 'Delivery', title: 'Delivery Ownership & Project Governance',
    description: 'Own project/workstream delivery outcomes with zero-surprise execution: own delivery planning, sprint/release governance, dependency tracking, escalation management, stakeholder communication, and delivery-health reporting; drive zero-failed-project behaviors via early risk identification, RAID governance, quality gates, and transparent status; actively manage committed scope, timelines, quality, staffing, and release readiness; track sprint predictability, defect leakage, rework, incidents, SLA adherence, change failure rate, and recovery time; drive RCA to closure for major issues and escalations; maintain handover discipline and audit-ready evidence.' },
  { designation: 'Engineering Manager', weight: '20%', category: 'Consulting', title: 'Client Success, CSAT/NPS & Delivery-Led Growth',
    description: 'Own client confidence and delivery-led growth signals: maintain regular client communication on delivery health, risks, trade-offs, and value; use CSAT, NPS, appreciation, escalation trends, adoption, repeat work, and extensions as success indicators; keep client demos, walkthroughs, release reviews, and trainings outcome-oriented; identify growth opportunities (automation, modernization, AI enablement, managed services, platform improvements); support account teams with insights, estimation, proposals, and case studies; convert delivery credibility into trust with clear options, risks, and business value.' },
  { designation: 'Engineering Manager', weight: '20%', category: 'People', title: 'People Management, Mentorship & Team Performance',
    description: 'Build and manage a high-performing, accountable, well-utilized team: own goal alignment, regular 1:1s, feedback, performance observation, career development, staffing inputs, and issue resolution; mentor seniors, leads, and engineers on ownership, communication, delivery discipline, estimation, and stakeholder handling; identify skill gaps and build capability plans aligned to project needs and AI adoption; improve onboarding, knowledge transfer, morale, and succession readiness; address performance concerns early with evidence and improvement plans; put the right people on the right work with clear accountability.' },
  { designation: 'Engineering Manager', weight: '20%', category: 'AI Enablement', title: 'Technical Oversight, AI Enablement & Engineering Excellence',
    description: 'Keep technical delivery credible, AI-enabled, secure, and maintainable: stay technically close enough to challenge estimates, spot design gaps, and validate assumptions; work with architects and leads so architecture decisions translate into executable plans; drive code-review discipline, test automation, CI/CD hygiene, observability, release quality, secure coding, and documentation; define a project-level AI enablement plan (development, testing, documentation, reporting, defect analysis, onboarding, support triage); sponsor practical AI/agentic accelerators; ensure responsible AI usage with human validation and client-policy alignment.' },
  { designation: 'Engineering Manager', weight: '5%', category: 'Compliance', title: 'Utilization, Compliance & Financial Discipline',
    description: 'Maintain utilization, process discipline, and responsible delivery economics: maintain team utilization targets while managing allocation, ramp-up, and bench risk; ensure accurate timesheets, forecasts, tracking, status reports, and governance artifacts; follow client and organizational policies for security, privacy, audit readiness, and responsible AI; monitor scope changes, effort burn, non-billable leakage, and change-request opportunities; ensure mandatory trainings are completed across the team.' },

  // ---- Associate Architect (40/20/20/15/5) ----
  { designation: 'Associate Architect', weight: '40%', category: 'Delivery', title: 'Architecture & Delivery Assurance',
    description: 'Ensure technical solution quality, scalability, maintainability, and delivery feasibility: own architecture/design for assigned modules, platforms, integrations, or solution areas; produce clear artifacts (HLD, LLD, integration design, data flow, security considerations, deployment view, NFR mapping); validate implementation aligns with architecture; join critical design reviews, code-quality reviews, release readiness, and RCA; reduce architecture-related rework with upfront design clarity; address scalability, security, performance, observability, and resilience; support leads on estimation, planning, dependencies, and risk; contribute reusable patterns and reference implementations.' },
  { designation: 'Associate Architect', weight: '20%', category: 'AI Enablement', title: 'AI-Enabled Architecture & Automation',
    description: 'Embed AI into architecture, delivery, and engineering workflows: identify project/account-level AI opportunities (developer productivity, testing, knowledge management, support triage, documentation, analytics, modernization, client-facing intelligence); design at least one AI-enabled solution, accelerator, agent, or workflow; establish responsible-AI guidelines (data safety, hallucination control, validation, auditability, human-in-the-loop); contribute to AI architecture playbooks, reusable prompts, and agent patterns; guide teams on when to use AI and how to validate output; measure AI impact via productivity, quality, cycle time, or client value.' },
  { designation: 'Associate Architect', weight: '20%', category: 'Consulting', title: 'Consulting, Client Impact, CSAT/NPS & Delivery-Led Growth',
    description: 'Support growth through technical trust and solution thinking: engage client stakeholders to clarify business problems, constraints, and success criteria; present solution options with trade-offs, risks, cost, timeline, and impact; identify modernization, automation, AI, cloud, data, security, and platform opportunities; support account growth via proposals, assessments, demos, workshops, and technical POVs; convert delivery insights into growth opportunities; demonstrate structured recommendations and business-value framing.' },
  { designation: 'Associate Architect', weight: '15%', category: 'People', title: 'Technical Leadership & Mentorship',
    description: 'Raise technical maturity across the team: mentor leads, senior engineers, and engineers on design, architecture, debugging, AI adoption, and quality practices; run architecture walkthroughs and knowledge-sharing sessions; review critical designs and guide implementation teams; build capability maps and learning recommendations; support career progression toward senior/lead roles; help establish engineering standards and reusable templates.' },
  { designation: 'Associate Architect', weight: '5%', category: 'Compliance', title: 'Compliance, Governance & Utilization',
    description: 'Ensure architecture governance and organizational discipline: maintain the utilization target; keep solution artifacts audit-ready and client-ready; follow security, privacy, compliance, and AI-governance requirements; participate in architecture governance boards and internal reviews; document risks, assumptions, decisions, and dependencies.' },

  // ---- Architect (35/25/20/15/5) ----
  { designation: 'Architect', weight: '35%', category: 'Delivery', title: 'Architecture Strategy & Delivery Assurance',
    description: 'Own solution integrity and technical success across projects, accounts, or programs: define architecture strategy aligned to client business goals; ensure designs are scalable, secure, maintainable, observable, and cost-conscious; provide architecture governance across teams; reduce delivery risk with early design reviews, dependency analysis, and NFR validation; catch weak signals early to support zero failed projects; guide critical technical decisions and trade-offs; keep decisions documented and communicated; support production/operational readiness; create reusable architecture assets and reference patterns.' },
  { designation: 'Architect', weight: '25%', category: 'AI Enablement', title: 'AI Transformation & Forward Deployment Engineering',
    description: 'Lead the shift toward AI-enabled, forward-deployed engineering: define the AI enablement roadmap for the account/practice; identify high-value AI use cases across the SDLC; establish agentic engineering patterns (coding, QA, documentation, support, knowledge, modernization, governance agents); create reusable AI accelerators and adoption playbooks; drive safe, governed AI adoption (data protection, human validation, traceability, client approval); measure AI impact at project/account level; enable forward deployment (client discovery, rapid prototyping, validation, adoption, feedback loops); coach leads and architects to productionize AI experiments.' },
  { designation: 'Architect', weight: '20%', category: 'Consulting', title: 'Consulting, Client Influence, CSAT/NPS & Delivery-Led Growth',
    description: 'Use architecture and delivery excellence to grow client trust and the account: build trusted-advisor relationships with client technology and business stakeholders; lead discovery workshops, architecture assessments, modernization reviews, and AI opportunity assessments; identify new opportunities from current delivery; support proposals, estimations, RFPs, solution shaping, and executive presentations; convert delivery credibility into growth; communicate complex decisions in business-friendly language.' },
  { designation: 'Architect', weight: '15%', category: 'People', title: 'Technical Leadership, Mentorship & Org Capability',
    description: 'Build scalable engineering and architecture capability: mentor associate architects, leads, and senior engineers; define engineering standards, architecture templates, review checklists, AI playbooks, and quality gates; build team capability plans; run architecture forums, case studies, and demos; improve technical hiring, onboarding, and evaluation; create reusable IP and practice assets; identify future leaders and support succession planning.' },
  { designation: 'Architect', weight: '5%', category: 'Compliance', title: 'Compliance, Governance & Utilization',
    description: 'Ensure governance and responsible delivery: maintain role-appropriate utilization; comply with client security, data, privacy, audit, and AI policies; maintain architecture reviews and decision records; support internal quality audits and risk reviews; ensure responsible use of GenAI and agentic tools in client contexts.' },
];

const SKILL_SUBSECTION = /certif|upskill|enablement|master in genai|gen ai|flutter|vue|react native|azure/i;
const FOCUS_QUESTION = /focus area|main priorities/i;
const WILL_SUBSECTION = /personal goal|personal objective|upskill|enablement|non.?project|internal project|mentorship|training junior|presentation|blog|workshop|leading internal/i;

async function main() {
  // ---- read reference ----
  const refWb = new ExcelJS.Workbook();
  await refWb.xlsx.readFile(REFERENCE_PATH);
  const ref = readSheet(refWb.getWorksheet('Reviews_Master')!);

  // ---- read app workbook (preserve everything) ----
  const appWb = new ExcelJS.Workbook();
  await appWb.xlsx.readFile(DATA_PATH);
  const sheets = new Map<string, { headers: string[]; rows: Row[] }>();
  appWb.eachSheet((ws) => sheets.set(ws.name, readSheet(ws)));

  const employees = sheets.get('Employees')!;
  const byEmail = new Map<string, string>();
  const byId = new Map<string, Row>();
  for (const e of employees.rows) {
    byEmail.set(String(e.email).trim().toLowerCase(), String(e.employeeId));
    byId.set(String(e.employeeId), e);
  }

  // ---- group reference rows by (employee, cycle) ----
  interface RefRow {
    empId: string; reviewer: string; type: string; section: string; sub: string;
    label: string; text: string; published: string;
  }
  const refRows: RefRow[] = ref.rows.map((r) => ({
    empId: String(r['Employee ID']),
    reviewer: String(r['Reviewer Email']).trim().toLowerCase(),
    type: String(r['Reviewer Type']),
    section: String(r['Review Section']),
    sub: String(r['Sub Section Title']).trim(),
    label: String(r['Reviewer Rating Label'] ?? '').trim(),
    text: String(r['Reviewer Inputs'] ?? '').trim(),
    published: String(r['Review Publish Date']).slice(0, 10),
    cycle: String(r['Review Cycle']),
  })) as (RefRow & { cycle: string })[];

  const groups = new Map<string, (RefRow & { cycle: string })[]>();
  for (const r of refRows as (RefRow & { cycle: string })[]) {
    const key = `${r.empId}|${r.cycle}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const reviewCycles: Row[] = [];
  const feedback: Row[] = [];
  const skillWill: Row[] = [];
  const individualGoals: Row[] = [];
  const latestFinal = new Map<string, { sortKey: string; label: string }>();
  const latestFocus = new Map<string, { sortKey: string; text: string; cycleLabel: string; published: string }>();
  let fbSeq = 0;

  for (const [key, rows] of groups) {
    const [empId, cycleRaw] = key.split('|');
    const emp = byId.get(empId);
    if (!emp) {
      console.warn(`  ! reference has employee ${empId} not present in Employees — skipped`);
      continue;
    }
    const cycle = parseCycle(cycleRaw);
    if (!cycle) {
      console.warn(`  ! unrecognized cycle '${cycleRaw}' — skipped`);
      continue;
    }
    const published = rows.reduce((max, r) => (r.published > max ? r.published : max), '');
    const pick = (section: string, type: string) => rows.filter((r) => r.section === section && r.type === type);
    const finalMgr = pick('FINAL_RATING', 'MANAGER')[0];
    const finalSelf = pick('FINAL_RATING', 'SELF')[0];

    // ---- notes: capture every detail, self + manager ----
    const parts: string[] = [];
    parts.push(`10x ${cycle.kind === 'annual' ? 'Annual' : 'Quarterly'} Review — ${cycle.label}. Published ${published}.`);
    if (finalMgr) {
      parts.push(`\nFINAL RATING: ${finalMgr.label}`);
      if (finalMgr.text) parts.push(`Manager: ${finalMgr.text}`);
      if (finalSelf?.text) parts.push(`Self (${finalSelf.label || 'no rating'}): ${finalSelf.text}`);
    }
    const sectionBlock = (section: string, title: string) => {
      const subs = [...new Set(rows.filter((r) => r.section === section).map((r) => r.sub))];
      if (!subs.length) return;
      parts.push(`\n${title}`);
      for (const sub of subs) {
        const mgr = rows.find((r) => r.section === section && r.sub === sub && r.type === 'MANAGER');
        const self = rows.find((r) => r.section === section && r.sub === sub && r.type === 'SELF');
        const label = mgr?.label || self?.label;
        parts.push(`• ${sub}${label ? ` — ${label}` : ''}`);
        if (mgr?.text) parts.push(`  Manager: ${mgr.text}`);
        if (self?.text) parts.push(`  Self: ${self.text}`);
      }
    };
    sectionBlock('OBJECTIVE', 'OBJECTIVES');
    sectionBlock('OPEN_QUESTIONS', 'OPEN QUESTIONS');
    sectionBlock('PROMOTION', 'PROMOTION');
    sectionBlock('PROMOTION_QUESTIONS', 'PROMOTION QUESTIONS');
    sectionBlock('TRAINING_NEEDED', 'TRAINING NEEDED');
    let notes = parts.join('\n');
    if (notes.length > NOTES_CHAR_LIMIT) notes = `${notes.slice(0, NOTES_CHAR_LIMIT)}\n… [truncated]`;

    reviewCycles.push({
      id: `rc-${empId}-${cycle.sortKey}`,
      employeeId: empId,
      name: cycle.name,
      startDate: cycle.date,
      endDate: cycle.date,
      status: 'completed',
      rating: finalMgr ? ratingTo5(finalMgr.label) : '',
      notes,
    });

    if (finalMgr && (!latestFinal.has(empId) || cycle.sortKey > latestFinal.get(empId)!.sortKey)) {
      latestFinal.set(empId, { sortKey: cycle.sortKey, label: finalMgr.label });
    }

    // ---- feedback from MANAGER rows ----
    for (const r of rows) {
      if (r.type !== 'MANAGER' || r.text.length <= 5) continue;
      if (r.section === 'FINAL_RATING' || r.section.startsWith('PROMOTION')) continue;
      if (r.section === 'OPEN_QUESTIONS' && FOCUS_QUESTION.test(r.sub)) continue; // becomes a goal
      const isSkill = r.section === 'OBJECTIVE' && SKILL_SUBSECTION.test(r.sub);
      const type = r.section === 'TRAINING_NEEDED' ? 'learning' : isSkill ? 'skill' : 'performance';
      const authorId = byEmail.get(r.reviewer) ?? '';
      const attribution = authorId ? '' : `\n(10x reviewer: ${r.reviewer})`;
      feedback.push({
        id: `fb10x-${++fbSeq}`,
        employeeId: empId,
        authorId,
        date: published,
        type,
        skill: isSkill ? r.sub : '',
        goalId: '',
        goalType: '',
        text: `${isSkill ? '' : `[${r.sub}] `}${r.text}${attribution}\n— 10x ${cycle.label}`,
        rating: r.label ? (ratingTo5(r.label) as Cell) : '',
      });
    }

    // ---- skill/will snapshot per cycle ----
    if (finalMgr) {
      const skill = ratingTo10(finalMgr.label);
      const willLabels = rows
        .filter((r) => r.section === 'OBJECTIVE' && r.type === 'MANAGER' && WILL_SUBSECTION.test(r.sub) && r.label)
        .map((r) => ratingTo10(r.label))
        .filter((n): n is number => n !== null);
      const will = willLabels.length
        ? Math.round(willLabels.reduce((a, b) => a + b, 0) / willLabels.length)
        : skill;
      if (skill !== null) {
        skillWill.push({
          id: `sw-${empId}-${cycle.sortKey}`,
          employeeId: empId,
          date: published,
          skill,
          will: will ?? skill,
          notes: `Derived from 10x ${cycle.label} — final rating: ${finalMgr.label}`,
        });
      }
    }

    // ---- focus areas -> individual goal (latest cycle only, resolved after loop) ----
    const focus = rows.find((r) => r.section === 'OPEN_QUESTIONS' && FOCUS_QUESTION.test(r.sub) && r.type === 'MANAGER' && r.text)
      ?? rows.find((r) => r.section === 'OPEN_QUESTIONS' && FOCUS_QUESTION.test(r.sub) && r.type === 'SELF' && r.text);
    if (focus && (!latestFocus.has(empId) || cycle.sortKey > latestFocus.get(empId)!.sortKey)) {
      latestFocus.set(empId, { sortKey: cycle.sortKey, text: focus.text, cycleLabel: cycle.label, published });
    }
  }

  // ---- upcoming cycle per person, from their appraisalCycle month ----
  const covered = new Set(reviewCycles.map((c) => `${c.employeeId}|${String(c.startDate).slice(0, 7)}`));
  for (const emp of employees.rows) {
    const empId = String(emp.employeeId);
    if (empId === '1231' || String(emp.isAdmin) === 'yes') continue; // Siddhu's own review isn't run in this app
    const mi = monthIndex(String(emp.appraisalCycle ?? ''));
    if (mi === -1) continue;
    const [ty, tm] = TODAY.split('-').map(Number);
    let year = ty;
    let status = 'not_started';
    let note = '';
    const mm = String(mi + 1).padStart(2, '0');
    if (covered.has(`${empId}|${year}-${mm}`) || String(emp.joinDate) >= firstDayOfMonth(year, mi)) {
      // this year's cycle already happened (or they joined too late for it) -> schedule next year's
      year += 1;
    } else if (mi + 1 < tm) {
      status = 'in_progress';
      note = 'Review window has passed — 10x publish pending.';
    } else if (mi + 1 === tm) {
      status = 'in_progress';
      note = 'Review in progress this month.';
    }
    const key = `${empId}|${year}-${mm}`;
    if (covered.has(key)) continue;
    covered.add(key);
    reviewCycles.push({
      id: `rc-${empId}-${year}-${String(mi + 1).padStart(2, '0')}-next`,
      employeeId: empId,
      name: 'Annual Review',
      startDate: lastDayOfMonth(year, mi),
      endDate: lastDayOfMonth(year, mi),
      status,
      rating: '',
      notes: note || `Upcoming appraisal (cycle month: ${MONTHS[mi]}).`,
    });
  }

  // ---- individual goals: the framework's "one custom goal on top" per person,
  // seeded from their latest 10x focus-areas answer ----
  for (const [empId, f] of latestFocus) {
    individualGoals.push({
      id: `ig-${empId}-focus`,
      employeeId: empId,
      title: `Custom goal: focus areas from 10x ${f.cycleLabel}`,
      description: f.text,
      category: 'Custom',
      status: 'in_progress',
      targetDate: '',
    });
  }

  // ---- designation goals: replace with the framework library ----
  const dgSheet = sheets.get('DesignationGoals') ?? { headers: [], rows: [] };
  dgSheet.headers = ['id', 'designation', 'title', 'description', 'category'];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  dgSheet.rows = FRAMEWORK_GOALS.map((g) => ({
    id: `dg-${slug(g.designation)}-${slug(g.category)}`,
    designation: g.designation,
    title: `${g.title} (${g.weight})`,
    description: g.description,
    category: g.category,
  }));
  sheets.set('DesignationGoals', dgSheet);

  // ---- growth status from latest final rating ----
  const growthUpdates: string[] = [];
  for (const [empId, f] of latestFinal) {
    const emp = byId.get(empId)!;
    const target = f.label.trim().toLowerCase() === 'leading the way' ? 'Exceeding' : 'On Track';
    if (String(emp.growthStatus) !== target) {
      emp.growthStatus = target;
      growthUpdates.push(`${emp.name}: ${target} (latest 10x: ${f.label})`);
    }
  }

  // ---- new custom columns: US Employee ID + Practice Head ----
  const usIds = new Map<string, string>();
  const practiceHeads = new Map<string, string>();
  for (const r of ref.rows) {
    usIds.set(String(r['Employee ID']), String(r['US Employee ID'] ?? ''));
    practiceHeads.set(String(r['Employee ID']), String(r['Current Practice Head'] ?? ''));
  }
  const columns = sheets.get('Columns')!;
  const maxOrder = Math.max(...columns.rows.map((r) => Number(r.order) || 0));
  const addColumn = (key: string, label: string, order: number) => {
    if (columns.rows.some((r) => String(r.key) === key)) return;
    columns.rows.push({ key, label, type: 'text', options: '', core: 'no', visible: 'no', order });
    if (!employees.headers.includes(key)) employees.headers.push(key);
  };
  addColumn('usEmployeeId', 'US Employee ID', maxOrder + 1);
  addColumn('practiceHead', 'Practice Head', maxOrder + 2);
  // the framework also covers Architect — make it selectable for future growth
  const desigCol = columns.rows.find((r) => String(r.key) === 'designation');
  if (desigCol && !String(desigCol.options).includes('Architect,')) {
    desigCol.options = 'Associate Engineer,Engineer,Senior Engineer,Associate Architect,Lead Engineer,Architect,Engineering Manager';
  }
  for (const emp of employees.rows) {
    const empId = String(emp.employeeId);
    emp.usEmployeeId = usIds.get(empId) ?? (emp.usEmployeeId || '');
    emp.practiceHead = practiceHeads.get(empId) ?? (emp.practiceHead || '');
  }

  // ---- replace derived sheets, preserve the rest ----
  reviewCycles.sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)) || String(a.startDate).localeCompare(String(b.startDate)));
  feedback.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  skillWill.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sheets.get('ReviewCycles')!.rows = reviewCycles;
  sheets.get('Feedback')!.rows = feedback;
  sheets.get('SkillWill')!.rows = skillWill;
  sheets.get('IndividualGoals')!.rows = individualGoals;

  // ---- write back ----
  const out = new ExcelJS.Workbook();
  for (const [name, data] of sheets) {
    const ws = out.addWorksheet(name);
    ws.addRow(data.headers);
    ws.getRow(1).font = { bold: true };
    for (const row of data.rows) ws.addRow(data.headers.map((h) => row[h] ?? ''));
    ws.columns.forEach((col, i) => {
      col.width = Math.max(14, (data.headers[i] ?? '').length + 6);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  await out.xlsx.writeFile(DATA_PATH);

  console.log(`ReviewCycles: ${reviewCycles.length} (completed: ${reviewCycles.filter((c) => c.status === 'completed').length}, in progress: ${reviewCycles.filter((c) => c.status === 'in_progress').length}, upcoming: ${reviewCycles.filter((c) => c.status === 'not_started').length})`);
  console.log(`Feedback: ${feedback.length} | SkillWill: ${skillWill.length} | IndividualGoals: ${individualGoals.length}`);
  console.log('Growth status updates:', growthUpdates.length ? '' : 'none');
  for (const g of growthUpdates) console.log('  -', g);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
