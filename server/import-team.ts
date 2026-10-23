// One-off (re-runnable) import of Siddhu's real team into data/manageplus.xlsx.
// Replaces the demo Employees/Columns data with the real tree and clears the
// demo goals/reviews/feedback history. Run: npx tsx server/import-team.ts
// Source: the team export pasted from the manager's source Excel (Aug 2026).
// All accounts get the password: welcome123
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { hashPassword } from './auth';
import { DATA_PATH } from './store';

const PASSWORD = 'welcome123';

const employeeHeaders = [
  'employeeId', 'name', 'email', 'designation', 'mentorId', 'currentProject',
  'projectHistory', 'skills', 'growthStatus', 'joinDate', 'isAdmin', 'passwordHash',
  // custom columns from the source sheet
  'lateralHired', 'academyHired', 'active', 'appraisalCycle', 'reportingManager',
  'joiningLocation', 'currentLocation', 'officeExempt',
];

interface Person {
  id: string; name: string; email: string; designation: string; mentorId: string;
  currentProject: string; projectHistory: string; skills: string; joinDate: string;
  lateral: string; academy: string; active: string; appraisal: string;
  reportingManager: string; joiningLocation: string; currentLocation: string; officeExempt: string;
}

const SIDDHU = 'EMP-001';
const RAMANATHAN = '1266';
const SAI = '1130';
const PRABU = '1638';

const team: Person[] = [
  {
    id: RAMANATHAN, name: 'Ramanathan Chinnasamy', email: 'rchinnasamy@presidio.com',
    designation: 'Lead Engineer', mentorId: SIDDHU, joinDate: '2021-05-07',
    lateral: 'Yes', academy: 'No', active: 'Yes', appraisal: 'February',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Propelis',
    projectHistory: 'State of Illinois (SoiL); Henry Schein; Cherokee Nation phase II; Disney; Propelis',
    skills: 'Web - React, Angular, JavaScript, Mobile - ReactNative, Backend - Java(springboot), Node(express), Python(fastapi, flask), Infra & CICD - Terraform, Jenkins, Docker, Database - Mysql, MongoDB, DynamoDB, Postgres, ML - Face recognition, object detection, model training(Yolo, CNN), AI tools - cursor, kiro, Cloud - AWS',
    officeExempt: 'No',
  },
  {
    id: '1298', name: 'Naveen Kumar Mohanasundaram', email: 'nmohanasundaram@presidio.com',
    designation: 'Senior Engineer', mentorId: RAMANATHAN, joinDate: '2021-06-21',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'March',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'WMG',
    projectHistory: 'AssistWiz; Janet (R&D); LPGA (R&D); USHG; CommuteApp (Internal); PSAX (Internal); Biolytica; PGA Tour; Sarepta; HerdWatch (Pre Sales); Zenful; CHOP; WMG',
    skills: 'Angular, React, Vue, Node.js, Python, Flutter, Docker, AWS, Azure Foundry, Databases',
    officeExempt: 'No',
  },
  {
    id: SAI, name: 'Sai Ayyappa O R', email: 'sor@presidio.com',
    designation: 'Associate Architect', mentorId: SIDDHU, joinDate: '2020-06-05',
    lateral: 'Yes', academy: 'No', active: 'Yes', appraisal: 'March',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'ModMed Devops engineering',
    projectHistory: 'Bandera; WheelPros; AAA; Insights (Internal) - Maintenance only; PFGC; ModMed Klara Aptible Migration; ModMed Devops engineering',
    skills: 'Springboot, Angular, React, AWS, Wordpress, Terraform, Kubernetes, Postgres, MySQL, DynamoDB, NodeJS, Python, Datadog, Types of Projects: Application Migration, Data Migration (on-prem to AWS postgres), Full Stack application development, Disaster Recovery',
    officeExempt: 'No',
  },
  {
    id: '1460', name: 'Keerthivasan Moorthy', email: 'kmoorthy@presidio.com',
    designation: 'Senior Engineer', mentorId: SAI, joinDate: '2022-07-04',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'July',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Paramount Security Pod',
    projectHistory: 'AAA; Andmore; Bostan Vs Bullies; Andeza; Paramount Security Pod',
    skills: 'Django, React, Node JS, Devextreme, AWS CDK, S3, EC2, Lambda, Cognito, Dynamo DB, API Gateway, ECS, SQS, Angular, Nest JS, Chartjs, HTML, CSS, JS, TS, Bootstrap, PrimeNG, Postgresql, MJML, Amplify, Java, serverless, Bedrock, Jquery, Mongodb',
    officeExempt: 'No',
  },
  {
    id: '1481', name: 'Samraj Anandun Baskaran', email: 'samrajab@presidio.com',
    designation: 'Senior Engineer', mentorId: SAI, joinDate: '2022-07-04',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'July',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Chat bot accelerator',
    projectHistory: 'Disney; ESA; Swapa wingman AI; Hard Rock Digital; Chop; Arena holdings; Sirius XM; Chat bot accelerator',
    skills: 'React, python, node TS, postgres, dynamodb, aws, MySQL, Mongo DB, langchain, langraph',
    officeExempt: 'No',
  },
  {
    id: '1510', name: 'Vibin Gowtham Anandh', email: 'vgowthama@presidio.com',
    designation: 'Senior Engineer', mentorId: SAI, joinDate: '2022-08-01',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'August',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Trivelta',
    projectHistory: 'Biolytica - Web and Mobile; Innovation Sprint 2025; Sarepta (Shadow); Hilton Grand Vacations; Draftkings; Trivelta',
    skills: 'React, React Native, Angular, Mysql, PostgresSQL, DynamoDB, MongoDB, Nodejs, AWS, Javascript, Python, Typescript, Cloudformation, Terraform, Flutter',
    officeExempt: 'No',
  },
  {
    id: '1581', name: 'Sanjai R', email: 'sanjair@presidio.com',
    designation: 'Engineer', mentorId: PRABU, joinDate: '2023-09-05',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'September',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Presidio Shield',
    projectHistory: 'Draft kings; Presidio Shield',
    skills: 'Javascript & TypeScript (React, React Native, Node), Xamarin, Next.js, kotlin, Flutter, Python(FastAPI), AWS Services, PostgreSQl, langchain',
    officeExempt: 'No',
  },
  {
    id: PRABU, name: 'Prabu R', email: 'prabur@presidio.com',
    designation: 'Lead Engineer', mentorId: SIDDHU, joinDate: '2024-04-03',
    lateral: 'Yes', academy: 'No', active: 'Yes', appraisal: 'April',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'AWS Proserve - Brightstar',
    projectHistory: 'Sage; SiriusXM; AWS Medialake; IDEM; AWS Proserve - Brightstar',
    skills: 'C# .net, Python, SQL, Angular, HTML, CSS, React, JavaScript, TypeScript, Azure, AWS',
    officeExempt: 'No',
  },
  {
    id: '1767', name: 'SAKTHI SASI VELAR K P', email: 'skp@presidio.com',
    designation: 'Engineer', mentorId: RAMANATHAN, joinDate: '2024-09-16',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: 'September',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'APC',
    projectHistory: 'APC',
    skills: 'Java, Spring Boot, Angular, React, Node.js, AWS, Python',
    officeExempt: 'No',
  },
  {
    id: '1858', name: 'Kishore CM', email: 'kcm@presidio.com',
    designation: 'Associate Engineer', mentorId: PRABU, joinDate: '2025-09-15',
    lateral: 'No', academy: 'Yes', active: 'Yes', appraisal: '',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'Lisense',
    projectHistory: 'SiriusXM; Lisense',
    skills: 'Python (FastAPI), Java (spring boot), GoLang(Gin), JavaScript & TypeScript (React, Node.js), HTML, CSS',
    officeExempt: 'No',
  },
  {
    id: '1905', name: 'Sathriyan Vadivelu', email: 'svadivelu@presidio.com',
    designation: 'Senior Engineer', mentorId: SIDDHU, joinDate: '2025-10-16',
    lateral: 'Yes', academy: 'No', active: 'Yes', appraisal: '',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: '',
    projectHistory: '',
    skills: '',
    officeExempt: '',
  },
  {
    id: '1931', name: 'Poovarasa Siva K R', email: 'poovarasasivakr@presidio.com',
    designation: 'Senior Engineer', mentorId: PRABU, joinDate: '2026-01-28',
    lateral: 'Yes', academy: 'No', active: 'Yes', appraisal: 'January',
    reportingManager: 'Siddhu Nallasivam', joiningLocation: 'Coimbatore', currentLocation: 'Coimbatore',
    currentProject: 'DentalXChange',
    projectHistory: 'DentalXChange',
    skills: '.Net Core, ASP.NET Core, Azure, Angular, TypeScript, MongoDB, NodeJs',
    officeExempt: 'No',
  },
];

const columnRows = [
  // key, label, type, options, core, visible, order
  ['name', 'Name', 'text', '', 'yes', 'yes', 1],
  ['employeeId', 'Presidio ID', 'text', '', 'yes', 'yes', 2],
  ['email', 'Email', 'text', '', 'yes', 'yes', 3],
  ['designation', 'Designation', 'select', 'Associate Engineer,Engineer,Senior Engineer,Associate Architect,Lead Engineer,Engineering Manager', 'yes', 'yes', 4],
  ['mentorId', 'Mentor', 'text', '', 'yes', 'yes', 5],
  ['currentProject', 'Current Project', 'text', '', 'yes', 'yes', 6],
  ['skills', 'Tech Stack / Skills', 'tags', '', 'yes', 'yes', 7],
  ['growthStatus', 'Growth Status', 'select', 'On Track,Exceeding,Needs Attention', 'yes', 'yes', 8],
  ['projectHistory', 'Projects History', 'tags', '', 'yes', 'no', 9],
  ['joinDate', 'DOJ', 'date', '', 'yes', 'no', 10],
  ['appraisalCycle', 'Appraisal Cycle', 'select', 'January,February,March,April,May,June,July,August,September,October,November,December', 'no', 'yes', 11],
  ['lateralHired', 'Lateral Hired', 'select', 'Yes,No', 'no', 'no', 12],
  ['academyHired', 'Academy Hired', 'select', 'Yes,No', 'no', 'no', 13],
  ['active', 'Active', 'select', 'Yes,No', 'no', 'no', 14],
  ['reportingManager', 'Reporting Manager', 'text', '', 'no', 'no', 15],
  ['joiningLocation', 'Tagged/Joining Location', 'text', '', 'no', 'no', 16],
  ['currentLocation', 'Current Location', 'text', '', 'no', 'no', 17],
  ['officeExempt', 'Office Exempt', 'select', 'Yes,No', 'no', 'no', 18],
];

export async function importTeam(): Promise<void> {
  const passwordHash = hashPassword(PASSWORD);
  const wb = new ExcelJS.Workbook();
  const existing = fs.existsSync(DATA_PATH);
  if (existing) await wb.xlsx.readFile(DATA_PATH);

  // ---- Employees: Siddhu (manager root) + admin + the real team ----
  const empRows: (string | number)[][] = [
    [SIDDHU, 'Siddhu Nallasivam', 'snallasivam@presidio.com', 'Engineering Manager', '',
      '', '', 'Architecture, Node.js, React, People Management', 'On Track', '2021-03-15', 'no', passwordHash,
      '', '', 'Yes', '', '', 'Coimbatore', 'Coimbatore', 'No'],
    ['EMP-000', 'Admin', 'admin@presidio.com', 'People Operations Admin', '',
      'People Ops', 'People Ops', 'HRIS, Operations', 'On Track', '2020-01-06', 'yes', passwordHash,
      '', '', 'Yes', '', '', '', '', ''],
    ...team.map((p) => [
      p.id, p.name, p.email, p.designation, p.mentorId, p.currentProject,
      p.projectHistory, p.skills, 'On Track', p.joinDate, 'no', passwordHash,
      p.lateral, p.academy, p.active, p.appraisal, p.reportingManager,
      p.joiningLocation, p.currentLocation, p.officeExempt,
    ]),
  ];

  const sheets: Record<string, { headers: string[]; rows: (string | number)[][] }> = {
    Employees: { headers: employeeHeaders, rows: empRows },
    Columns: { headers: ['key', 'label', 'type', 'options', 'core', 'visible', 'order'], rows: columnRows as (string | number)[][] },
    // Real data starts with a clean slate — demo goals/reviews/feedback referenced demo people.
    IndividualGoals: { headers: ['id', 'employeeId', 'title', 'description', 'category', 'status', 'targetDate'], rows: [] },
    ReviewCycles: { headers: ['id', 'employeeId', 'name', 'startDate', 'endDate', 'status', 'rating', 'notes'], rows: [] },
    Feedback: { headers: ['id', 'employeeId', 'authorId', 'date', 'type', 'skill', 'goalId', 'goalType', 'text', 'rating'], rows: [] },
    SkillWill: { headers: ['id', 'employeeId', 'date', 'skill', 'will', 'notes'], rows: [] },
    Meta: { headers: ['key', 'value'], rows: [['lastEmployeeSeq', 1931]] },
  };

  for (const [name, spec] of Object.entries(sheets)) {
    const old = wb.getWorksheet(name);
    if (old) wb.removeWorksheet(old.id);
    const ws = wb.addWorksheet(name);
    ws.addRow(spec.headers);
    ws.getRow(1).font = { bold: true };
    for (const row of spec.rows) ws.addRow(row);
    ws.columns.forEach((col, i) => {
      col.width = Math.max(14, (spec.headers[i] ?? '').length + 6);
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  // DesignationGoals sheet is kept as-is (common goals still apply); create it if missing.
  if (!wb.getWorksheet('DesignationGoals')) {
    const ws = wb.addWorksheet('DesignationGoals');
    ws.addRow(['id', 'designation', 'title', 'description', 'category']);
    ws.getRow(1).font = { bold: true };
  }

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  await wb.xlsx.writeFile(DATA_PATH);
  console.log(`Imported ${team.length} team members into ${DATA_PATH}`);
  console.log(`Logins: snallasivam@presidio.com (manager), admin@presidio.com (admin), any team email (employee) — password "${PASSWORD}"`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  importTeam().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
