# WorkSphere AI 
**Gen AI Research Lab Management System**

WorkSphere AI is a full-stack, multi-agent management system engineered for the National Center of Artificial Intelligence (NCAI). It streamlines lab operations, AI research tracking, employee attendance, and task delegation using strict, hardcoded database queries and automated AI agents driven by robust system prompts.

---

## 🚀 Quick Start Guide

Follow these instructions strictly to boot up the development environment.

### 1. Start the Backend (FastAPI & AI Agents)
The backend handles all database transactions, JWT authentication, and AI parsing logic.

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Activate the virtual environment
.\venv\Scripts\activate

# 3. Run the FastAPI server
uvicorn main:app --reload
The backend will run on http://127.0.0.1:8000. Swagger API docs available at http://127.0.0.1:8000/docs.

2. Start the Frontend (Next.js)
The frontend provides the role-based UI dashboards for Superadmins, Admins, and Employees.

PowerShell
# 1. Open a NEW terminal and navigate to the frontend directory
cd frontend

# 2. Install dependencies (if not already done)
npm install

# 3. Run the Next.js development server
npm run dev
The frontend will run on http://localhost:3000.

🔐 Authentication & Security
All routing and data access are secured via strict role-based access control (RBAC).

JWT Authentication: Handled via Supabase Auth. Tokens must be passed in headers for all backend API calls.

Roles: superadmin, admin, employee.

Hardcoded Queries: Backend API routes utilize explicit, hardcoded Supabase SQL/RPC queries to ensure strict data isolation between users and workspaces.

⚙️ Core Modules & Features
1. Identity & Access
Login/Signup Pages: Secure entry points with JWT generation.

Role Verification: Automatic redirect to respective dashboards based on JWT payload.

2. Employee Dashboard
Attendance: Check-in/Check-out logging with timestamp validation.

Work Uploads: Submission of daily research and work reports. Parsed securely via Gen AI agents using strict system prompts to extract progress and blockers.

Tasks: View assigned tasks and deadlines.

Messages: Secure communication within assigned workspaces.

3. Admin & Superadmin Controls
Global Review: Read-only and edit access to all employee work reports, attendance logs, and project statuses.

Task Management: Create, assign, and enforce strict deadlines for tasks.

Workspaces: Create isolated project groups and assign specific employees to them.

Alert System: Push high-priority alerts to specific employees, specific workspaces, or broadcast globally to the entire lab.

🤖 AI Agent Architecture
The backend utilizes specialized AI agents to process lab data.

Strict System Prompts: Agents operate under immutable system prompts that dictate output formatting (e.g., forcing JSON output, preventing hallucinations, and strictly extracting blockers from work reports).

Work Parsing: Automatically summarizes complex Gen AI research updates uploaded by employees into digestable metrics for the Admin dashboard.

🛠 Tech Stack

Frontend: Next.js, React, Tailwind CSS

Backend: Python, FastAPI, Pydantic

Database: Supabase (PostgreSQL)

AI Integration: OpenRouter