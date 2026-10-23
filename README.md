# ManagePlus

A minimal, modern manager's companion app for engineering managers. An Excel
workbook (`data/manageplus.xlsx`) is the single source of truth — every change
made in the app is written straight back to the file, and edits made directly
in Excel are picked up automatically on the next request.

## Features

- **My Team** — your full reporting tree (directs + nested skip levels) or a
  flat list. Add / edit / remove people, manage the columns themselves
  (add / rename / hide / reorder / delete), and export any column selection
  to an Excel file.
- **Goals** — common goals per designation (Associate / Senior / Lead / …)
  plus individual goals layered on top per person.
- **Reviews** — a month-grouped calendar of every review cycle, color-coded
  by status (green = completed, yellow = in progress, red = not started);
  click a bar for details.
- **Feedback** — skill / learning / performance feedback, optionally tagged
  to a goal; quarterly continuous check-ins with ratings and overdue nudges;
  a skill–will matrix per person and consolidated for the whole team; full
  history and progress view per person.
- **RBAC** — employee, manager (anyone with mentees), and admin logins.
- **Themes** — swappable design themes (Light, Dark, Ocean, Sand).

## Running

```bash
npm install
npm run dev        # API on :3001, web app on :5173
```

The workbook is seeded automatically on first start (or run `npm run seed`).

## Demo accounts

All demo accounts use the password `welcome123`.

| Role     | Email                              |
| -------- | ---------------------------------- |
| Manager  | snallasivam@presidio.com    |
| Admin    | admin@presidio.com          |
| Employee | kreddy@presidio.com         |

## Stack

React 18 + TypeScript + Vite · Express · ExcelJS (workbook as database)
