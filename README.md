# LocalPayroll (MRD-Payroll)

Professional and fully offline payroll management software tailored explicitly for robust attendance tracking and financial accountability. This system acts as a standalone desktop application built on Electron, Node.js, and SQLite.

## Core Features
The system brings automation and precision to managing medium scale staff requirements without needing cloud dependency.

### Employee & Project Management
- **Complete Profile Tracking:** Stores employee Roles, Phone Numbers, Basic Monthly Salaries, and start-dates natively.
- **Dynamic Site Projects:** Administrators can define custom workspace locations (projects). The daily attendance module incorporates drop-downs to associate daily presence with distinct company projects.

### Dynamic Attendance Engine
- **Bulk Workflows with Auto-Save:** Optimized UI that saves records in real-time without requiring "Save All" clicks, increasing data entry efficiency.
- **Overtime Calculations:** Granular control over hours. The internal rules automatically discard any overtime logged short of a strict 1-hour minimum threshold to maintain operational standards.
- **Advanced Navigation and Insights:** Seamless forward/backward day traversal and real-time live snapshot of team disposition (Present/Absent counts and project mapping) reflected directly on the dashboard.

### Comprehensive Salary Processing
- **Batch Evaluation:** Salary calculation routes analyze arrays of employees at once, building a master "Monthly Processing" interface to evaluate organization-wide financial obligations within microseconds.
- **Partial & Custom Payments:** Allows payroll delegates to input an exact "Actual Amount Paid". 
- **Systemic Arrears & Advances:** Instead of manually maintaining ledgers, overpayments logically morph into carry-forward advances for the following month. Underpayments automatically log as deficit arrears, rolling debts safely into the next cycle.

### Reporting & Documentation
- **XLSX & PDF Generation:** Built-in exporters for generating fully formatted Monthly PDF ledgers, Payslips, and detailed Daily Attendance Excel sheets.

## Technical Architecture

- **Presentation Layer:** HTML, Vanilla CSS, JS (No complex UI frameworks, pure performance).
- **Middle Layer:** Electron IPC (Fast, secure bridge between UI and underlying logic).
- **Backend / Logic:** Node.js (Pure localized runtime execution).
- **Database:** SQLite via `better-sqlite3`

*Note: The system securely executes all core financial calculations internally as integers (Paisa scaling). Doing so mathematically eliminates all floating-point irregularities present in standard IEEE 754 logic.*

## Installation & Build Instructions

### Development Setup
Ensure Node.js and system build tools (Python, Visual Studio C++) are installed for SQLite compilation.

```bash
# Install local packages and build native modules
npm install

# Start Local Developer Environment
npm start
```

### Packaging for Release
To package the tool into a rigid Windows executable binary `.exe`:

```bash
npm run build:win
```

*For immediate native compilation without installer wrappers:*
```bash
npx electron-packager . LocalPayroll --platform=win32 --arch=x64 --out=dist --overwrite
```

This will transport the finalized build context into `./dist/LocalPayroll-win32-x64/`.

## Data Authority & Privacy
The application strictly enforces an offline operational paradigm. User configuration, settings, salary logic, and attendance records are securely preserved in standard local SQLite databases (`app.db`) stored within the user's localized AppData directory under `LocalPayroll`. No data is communicated to external internet domains or cloud synchronizers.
