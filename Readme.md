# WorkSphere AI

WorkSphere AI is a full-stack Generative AI application featuring a Next.js frontend and a Python FastAPI backend. It utilizes Retrieval-Augmented Generation (RAG) and multi-agent architectures to process and intelligently interact with structured data.

## 🚀 Tech Stack
* **Frontend:** Next.js, React, TypeScript, Tailwind CSS
* **Backend:** Python, FastAPI, Uvicorn
* **AI & Data:** OpenRouter API, ChromaDB, RAG Pipelines
* **Database:** Supabase (PostgreSQL)
* **Infrastructure:** Docker, Bash scripting

---

## ⚙️ Environment Variables
Create a `.env` file in the root of both the `frontend` and `backend` directories (or configure them in your cloud provider) with the following keys:

```env
# Database & Auth
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key

# Next.js Public Keys
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI Providers
OPENROUTER_API_KEY=your_openrouter_api_key
💻 Local Development Setup (Windows)
If you are setting up the project from scratch on a new Windows machine, follow these steps:

Step 1: Install Python 3.10 and Node.js
Open PowerShell or Command Prompt as Administrator and run these commands one by one to install the required dependencies:

Bash
# Install Python 3.10 exactly
winget install -e --id Python.Python.3.10

# Install Node.js (required for Next.js)
winget install -e --id OpenJS.NodeJS
CRITICAL: After these two commands finish, close the terminal and open a new one. This refreshes the system path so it recognizes the python and npm commands.

Step 2: Start the FastAPI Backend
In your newly opened terminal, navigate to the extracted WorkSphere folder and run:

Bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
The backend will now be running on http://127.0.0.1:8000

Step 3: Start the Next.js Frontend
Open a second terminal window, navigate to the extracted WorkSphere folder, and run:

Bash
cd frontend
npm install
npm run dev
The frontend will now be accessible at http://localhost:3000

🐳 Running with Git Bash (Unified Local Run)
If you have Git Bash installed, you can start both the frontend and backend simultaneously using the provided startup script:

Bash
bash start.sh
☁️ Cloud Deployment (Railway)
The project includes a Dockerfile and start.sh script, making it fully configured for single-container deployment on platforms like Railway.

Step 1: Connect the GitHub Repository
Log in to Railway.app using your GitHub account.

From the dashboard, click the New Project button.

Select Deploy from GitHub repo.

Choose the repository where the WorkSphere AI code is pushed.

Click Deploy Now.
(Note: Railway will instantly scan the code, detect the Dockerfile in the root folder, and automatically build the single-container app.)

Step 2: Add Environment Variables (Crucial)
While Railway is building the container, it needs your API keys to succeed:

Click on the project card that just appeared on your dashboard.

Go to the Variables tab at the top.

Click New Variable and add all the keys from your local .env file one by one:

SUPABASE_URL

SUPABASE_KEY

OPENROUTER_API_KEY

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

(⚠️ Do NOT add a PORT variable. Railway injects this automatically into the start.sh script).

Step 3: Generate a Public Web Address
By default, Railway apps are private. You must expose the frontend to the internet:

Inside your project settings, click the Settings tab.

Scroll down to the Networking section.

Under "Public Networking", click Generate Domain.

Railway will provide a live URL (e.g., worksphere-production.up.railway.app).

Step 4: Wait for the Build to Finish
Click the Deployments tab. You will see a terminal view (Build Logs) showing the automated build process:

Installing Python...

Installing Node.js...

Installing pip requirements...

Building Next.js frontend...