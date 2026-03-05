# KRA Dashboard (Maharashtra WRD)

KRA Dashboard is a bilingual (Marathi + English) web application for monthly KRA data entry, monitoring, dashboard analytics, and admin management.

## Tech Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB
- Auth: JWT

## What the App Does

- User login/signup and role-based access
- Monthly KRA data entry with validation
- Financial year controls (active/locked year)
- Dashboard analytics and exports (Excel/PDF)
- Admin panel for:
  - Entry CRUD
  - User management
  - Financial year management
  - KRA master CRUD (7 KRAs)

## Project Structure

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
