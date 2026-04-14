# LocalPayroll (MRD-Payroll)

Professional and fully offline payroll management software tailored explicitly for robust attendance tracking and financial accountability. This system acts as a standalone desktop application built on Electron, Node.js, and SQLite.

## Core Features

### Employee Management
- Complete profile tracking including Role, Phone Number, Basic Monthly Salary, and Joining Date logic.
- Maintains historical employment records locally.

### Attendance Engine
- Bulk Daily and Monthly visual interface.
- Automatic In/Out time tracking linked directly to Standard Hourly constraints.
- Integrated Overtime calculations accurately resolving beyond 9-hour work days.
- Joining-Date Safeguard restricts attendance interactions before an employee's starting date.
- Sunday Premium Rule triggers an automatic double-rate modifier on flagged weekend days.

### Salary Processing & Advances
- Prorated financial calculations built on pure attendance logs.
- Issuing Advance logic linked across subsequent periods.
- Advance Carry Forward mechanism automatically preserves and propagates unpaid advances down to successive pay periods if drawn balances exceed total effective earnings.

## Technical Architecture

- Presentation Layer: HTML, Vanilla CSS, JS
- Middle Layer: Electron IPC
- Backend / Logic: Node.js (Local execution)
- Database: SQLite via `better-sqlite3`

*Note: The system entirely stores financial data internally as absolute integers (Paisa form) to avoid any floating-point arithmetic errors.*

## Installation & Build Instructions

### Development Setup
Ensure Node.js is installed.

```bash
# Install NPM modules locally
npm install

# Start Local Dev environment
npm start
```

### Building for Production
To package the tool into a robust Windows executable `.exe`:

```bash
npm run build:win
```

*Or, utilizing the immediate electron-packager:*
```bash
npx electron-packager . LocalPayroll --platform=win32 --arch=x64 --out=dist --overwrite
```

This will output the finalized build product to `./dist/LocalPayroll-win32-x64/`.

## Data Storage
The entire application runs purely offline. User data, settings, and structural history are securely maintained in standard local SQLite files (`app.db`) stored within the user's localized AppData directory under `LocalPayroll`. No data is ever transmitted to cloud instances.
