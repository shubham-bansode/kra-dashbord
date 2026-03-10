# KRA Monitoring Dashboard

## 1. Project Title

KRA Monitoring Dashboard is a bilingual web-based monitoring system designed to digitize monthly Key Result Area (KRA) data collection, validation, analysis, and administration for organizational reporting workflows.

This project appears to be tailored for Water Resources Department style reporting structures where performance data is submitted across hierarchical units such as corporation, region, circle, and division.

## 2. Project Overview

### Problem the Project Solves

Many organizations still collect monthly performance data through spreadsheets, manual forms, and fragmented reporting chains. That creates several problems:

- Data entry is repetitive and error-prone.
- Reporting formats are inconsistent across units.
- Duplicate submissions are difficult to detect.
- Monitoring performance across months and departments is slow.
- Administrative control over financial years, user roles, and KRA definitions is limited.

KRA Monitoring Dashboard centralizes that process into a single system where users can log in, submit monthly KRA achievements, and view structured dashboards, while administrators can manage master data, users, and reporting periods.

### Why the Project Is Important

This system improves transparency, consistency, and decision-making. Instead of relying on scattered files and manual consolidation, the platform provides a standard workflow for collecting and analyzing performance data. That is especially valuable in institutional or government-style environments where accuracy, traceability, and periodic review matter.

### Target Users

- Department staff or field users who submit monthly KRA entries
- Monitoring officers and reviewers who analyze performance trends
- Administrators who manage users, financial years, and KRA master records
- Students, mentors, and evaluators reviewing the project as a capstone/final year system

## 3. Project Objectives

### Main Goals

- Digitize monthly KRA data submission
- Enforce structured validation for hierarchy and financial year reporting
- Provide dashboards for monitoring achievement and target performance
- Support bilingual access in English and Marathi
- Enable secure, role-based access for users and administrators
- Reduce manual work involved in compiling reports and exports

### Expected Outcomes

- Faster monthly reporting cycles
- Fewer data-entry and duplicate-submission errors
- Better visibility into achievement percentages and performance gaps
- Easier administrative control over reporting periods and users
- A reusable academic/enterprise-ready reporting platform

## 4. Key Features

### User-Facing Features

- User registration and login using mobile number and password
- Separate admin login workflow
- Protected routes for authenticated users
- Monthly KRA data entry form with validation
- Support for financial-year-based reporting
- Corporation, region, circle, and division hierarchy selection
- Duplicate submission checks before saving monthly entries
- Dashboard analytics with charts and filters
- Excel export for reports
- PDF export for reports
- Bilingual interface support in Marathi and English

### Administrative Features

- Financial year creation, activation, locking, and deletion
- User management with status and role updates
- Admin entry creation, editing, viewing, and deletion
- Bulk deletion and wipe operations for entries
- KRA master CRUD operations
- Corporation update support
- Admin statistics and dropdown/master-data endpoints

### Data Quality and Validation Features

- Validation of Indian mobile numbers
- Financial year and achievement date alignment checks
- Hierarchy validation for region, circle, and division mapping
- Google Form hierarchy consistency checks for allowed names
- Role-based authorization for admin-only operations

### AI Features

The current repository does not contain an implemented AI or machine learning recommendation engine.

Instead, the system currently provides analytics through:

- Aggregation-based dashboard summaries
- Ranking and comparison logic
- Trend analysis across monthly submissions
- Performance percentage calculations

If you want to position this as an AI-enabled future-ready system for academic presentation, it is more accurate to describe the current version as analytics-driven rather than AI-driven.

## 5. System Architecture

### High-Level Flow

1. Users access the React frontend in the browser.
2. The frontend sends HTTP requests to the Express backend.
3. The backend validates requests, authorizes users with JWT, and processes business rules.
4. MongoDB stores users, hierarchy data, financial years, KRA master records, and monthly entries.
5. Dashboard endpoints aggregate stored data and return summary metrics, rankings, and trend data.
6. Export endpoints generate Excel and PDF files for reporting.

### Frontend

The frontend is built with React and Vite. It handles:

- Routing between pages such as home, login, data entry, dashboard, monitoring, and admin
- Authentication state management through a shared AuthContext
- API communication through Axios
- Data visualization using chart components
- Internationalized text using a language context

### Backend

The backend is a Node.js and Express API server. It handles:

- Authentication and token issuance
- Authorization for users, admins, and superadmins
- CRUD operations for master and transactional data
- Input validation using express-validator
- Aggregation queries for dashboard analytics
- File export generation in Excel and PDF formats

### Database Interaction

MongoDB is used as the primary database through Mongoose models. Main data collections include:

- User
- Corporation
- Region
- Circle
- Division
- Kra
- FinancialYear
- KraMonthlyEntry

These collections support both master data and monthly performance records.

### AI Model Layer

There is no active AI model integration in the current codebase. All current insights are generated through deterministic aggregation and filtering logic in backend dashboard routes.

### Architecture Diagram

```text
Browser (React + Vite)
  |
  v
Frontend UI + Auth State + Charts
  |
  v
REST API (Node.js + Express)
  |
  +--> Auth & Role Middleware
  +--> Validation Rules
  +--> Dashboard Aggregations
  +--> Export Services (Excel/PDF)
  |
  v
MongoDB (Mongoose Models)
```

## 6. Technology Stack

### Frontend Technologies

- React 18
- Vite
- React Router DOM
- Axios
- Tailwind CSS
- Recharts
- clsx
- tailwind-merge

### Backend Technologies

- Node.js
- Express.js
- Mongoose
- express-validator
- bcryptjs
- jsonwebtoken
- cors
- dotenv

### AI / Machine Learning Technologies

- No AI/ML library is currently implemented in this repository
- Current analytics are rule-based and aggregation-driven

### Database

- MongoDB

### APIs Used

- Internal REST API built with Express
- Browser-to-backend API via Axios

### Reporting / File Processing Libraries

- xlsx for Excel import/export
- pdfkit for PDF generation

### Deployment Platforms Suitable for This Project

- Frontend: Vercel or Netlify
- Backend: Render or Railway
- Database: MongoDB Atlas

## 7. AI/ML Component

### What AI Is Used

At present, no machine learning model, generative AI service, or predictive engine is integrated into this project.

### How Recommendations Are Generated

The current system does not generate AI recommendations. Instead, it produces operational insights using:

- Aggregated achievement totals
- Target vs. achievement percentages
- Best performer and worst performer summaries
- Monthly trend calculations
- Rank tables and comparative charts

### How User Data Is Processed

User input is processed through backend validation and stored in MongoDB. Dashboard reports are generated by querying and aggregating the stored records. No user data is currently sent to an external AI service.

## 8. Folder Structure

```text
New KRA/
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── seeds/
│   ├── utils/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── auth/
│   │   ├── components/
│   │   ├── config/
│   │   ├── i18n/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js 18+
- MongoDB running locally or cloud URI

## Environment Setup

Create `backend/.env` with:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/kra_monitoring
JWT_SECRET=change_this_secret
NODE_ENV=development
```

## Run the Project

### 1) Backend

```bash
cd backend
npm install
npm run dev
```

Backend starts at `http://localhost:5000`.

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:3000`.

## Useful Backend Scripts

From `backend/`:

- `npm run seed` → seed base data
- `npm run add-sample` → add sample entries
- `npm run wipe-entries` → wipe KRA entries (protected command)

## Core API Groups

- `/api/auth` → authentication
- `/api/kra-entries` → user data entry
- `/api/dashboard` → analytics and exports
- `/api/admin` → admin operations
- `/api/kras` → KRA master list and admin CRUD

## Notes

- KRA master is editable from Admin panel.
- App expects 7 KRAs for monthly entry flow.
- If KRA names are updated in admin, new entries use updated names.

---

Maintained for Water Resources Department workflows.
