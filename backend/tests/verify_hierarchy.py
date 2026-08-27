import sys
import os
import unittest
from uuid import UUID
from datetime import datetime, timezone

# Add root folder to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Define mock databases
MOCK_PROFILES = [
    {"id": "00000000-0000-0000-0000-000000000001", "email": "super@ncai.gov", "role": "superadmin", "lab_id": None, "status": "approved", "full_name": "Super Admin", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000002", "email": "admin_ai@ncai.gov", "role": "admin", "lab_id": "ai", "status": "approved", "full_name": "AI Lab Admin", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000003", "email": "admin_gen@ncai.gov", "role": "admin", "lab_id": "gen_ai", "status": "approved", "full_name": "GenAI Lab Admin", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000004", "email": "emp_ai@ncai.gov", "role": "employee", "lab_id": "ai", "status": "approved", "full_name": "AI Researcher", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000005", "email": "emp_gen@ncai.gov", "role": "employee", "lab_id": "gen_ai", "status": "approved", "full_name": "GenAI Researcher", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000006", "email": "pending_ai@ncai.gov", "role": "employee", "lab_id": "ai", "status": "pending", "full_name": "Pending AI", "created_at": "2026-08-09T00:00:00Z"},
    {"id": "00000000-0000-0000-0000-000000000007", "email": "pending_gen@ncai.gov", "role": "employee", "lab_id": "gen_ai", "status": "pending", "full_name": "Pending GenAI", "created_at": "2026-08-09T00:00:00Z"},
]

MOCK_DB = {
    "profiles": [],
    "alerts": [],
    "last_update": None
}

# Setup Mock Supabase Client
class MockExecute:
    def __init__(self, data=None):
        self.data = data or []

class MockBuilder:
    def __init__(self, data):
        self.data = data
    def eq(self, column, value):
        val_str = str(value)
        filtered = []
        for x in self.data:
            field_val = x.get(column)
            if field_val is None:
                continue
            if str(field_val) == val_str:
                filtered.append(x)
        return MockBuilder(filtered)
    def order(self, *args, **kwargs):
        return self
    def execute(self):
        return MockExecute(self.data)

class MockTable:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.payload = None

    def select(self, *args, **kwargs):
        return MockBuilder(self.db.get(self.name, []))

    def insert(self, payload, *args, **kwargs):
        rec = dict(payload)
        if "id" not in rec:
            rec["id"] = "00000000-0000-0000-0000-000000000099"
        if "created_at" not in rec:
            rec["created_at"] = "2026-08-09T00:00:00Z"
        self.db[self.name].append(rec)
        return MockBuilder([rec])

    def update(self, payload, *args, **kwargs):
        self.payload = payload
        return self

    def eq(self, column, value):
        if self.payload is not None:
            val_str = str(value)
            updated_items = []
            for item in self.db.get(self.name, []):
                if str(item.get(column)) == val_str:
                    item.update(self.payload)
                    updated_items.append(item)
            self.db["last_update"] = self.payload
            self.payload = None
            return MockBuilder(updated_items)
        else:
            return MockBuilder(self.db.get(self.name, [])).eq(column, value)

class MockAuthAdmin:
    def update_user_by_id(self, user_id, payload):
        return None

class MockAuth:
    def __init__(self):
        self.admin = MockAuthAdmin()

class MockSupabaseClient:
    def __init__(self, db):
        self.db = db
        self.auth = MockAuth()
    def table(self, name):
        return MockTable(name, self.db)

mock_client = MockSupabaseClient(MOCK_DB)

# 1. Override the global cached client inside app.db.supabase to bypass DB connection completely
import app.db.supabase
app.db.supabase._supabase = mock_client

# 2. Import main and other modules
import main
from app.core.security import require_admin, require_superadmin
from fastapi import HTTPException
from fastapi.testclient import TestClient

class TestHierarchyAndScoping(unittest.TestCase):
    def setUp(self):
        self.app = main.app
        self.client = TestClient(self.app)
        # Reset database states
        MOCK_DB["alerts"] = []
        MOCK_DB["last_update"] = None
        # Deep copy profiles to prevent cross-test mutations
        MOCK_DB["profiles"] = [dict(p) for p in MOCK_PROFILES]

    def test_superadmin_queries(self):
        # Mock superadmin context dependency
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[0] # Super Admin
        
        # Superadmin can view ALL researchers (strictly role = employee)
        res = self.client.get("/api/v1/admin/researchers")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2) # emp_ai, emp_gen are approved employees (total 2)
        approved_emails = [u["email"] for u in data]
        self.assertIn("emp_ai@ncai.gov", approved_emails)
        self.assertIn("emp_gen@ncai.gov", approved_emails)

        # Superadmin can filter researchers by lab_id
        res = self.client.get("/api/v1/admin/researchers?lab_id=ai")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1) # emp_ai
        self.assertTrue(all(u["lab_id"] == "ai" for u in data))
        
        # Superadmin can view ALL pending users
        res = self.client.get("/api/v1/admin/pending")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 2) # pending_ai, pending_gen

    def test_lab_admin_queries(self):
        # Mock AI Lab Admin context dependency
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[1] # AI Lab Admin
        
        # AI Lab Admin can ONLY view AI researchers
        res = self.client.get("/api/v1/admin/researchers")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1) # emp_ai
        self.assertTrue(all(u["lab_id"] == "ai" for u in data))
        self.assertNotIn("emp_gen@ncai.gov", [u["email"] for u in data])

        # AI Lab Admin can ONLY view AI pending requests
        res = self.client.get("/api/v1/admin/pending")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["email"], "pending_ai@ncai.gov")

    def test_scoped_approvals(self):
        # AI Lab Admin approves AI pending user
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[1] # AI Lab Admin
        pending_ai_id = "00000000-0000-0000-0000-000000000006"
        
        res = self.client.post(f"/api/v1/admin/approve/{pending_ai_id}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "success")
        
        # Verify user is approved in mock DB
        user_record = next(u for u in MOCK_DB["profiles"] if u["id"] == pending_ai_id)
        self.assertEqual(user_record["status"], "approved")

        # AI Lab Admin tries to approve GenAI pending user -> Should return 403 Forbidden
        pending_gen_id = "00000000-0000-0000-0000-000000000007"
        res = self.client.post(f"/api/v1/admin/approve/{pending_gen_id}")
        self.assertEqual(res.status_code, 403)
        self.assertIn("only approve users belonging to your assigned lab", res.json()["detail"])

        # Superadmin approves GenAI pending user -> Should succeed
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[0] # Super Admin
        res = self.client.post(f"/api/v1/admin/approve/{pending_gen_id}")
        self.assertEqual(res.status_code, 200)

    def test_scoped_alerts(self):
        # AI Lab Admin dispatches global alert -> Should return 403 Forbidden
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[1] # AI Lab Admin
        res = self.client.post("/api/v1/admin/alerts", json={
            "title": "System Alert",
            "content": "Alert Content",
            "target_type": "global"
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("cannot dispatch global alerts", res.json()["detail"])

        # AI Lab Admin dispatches lab alert -> Should succeed and get forced to 'ai' lab
        res = self.client.post("/api/v1/admin/alerts", json={
            "title": "System Alert",
            "content": "Alert Content",
            "target_type": "lab"
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["target_type"], "lab")
        self.assertEqual(data["target_lab"], "ai")

        # Superadmin dispatches global alert -> Should succeed
        self.app.dependency_overrides[require_admin] = lambda: MOCK_PROFILES[0] # Super Admin
        res = self.client.post("/api/v1/admin/alerts", json={
            "title": "System Alert",
            "content": "Alert Content",
            "target_type": "global"
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["target_type"], "global")

    def test_profile_updates(self):
        # Superadmin re-assigns role and lab mapping
        self.app.dependency_overrides[require_superadmin] = lambda: MOCK_PROFILES[0] # Super Admin
        researcher_id = "00000000-0000-0000-0000-000000000004" # AI Researcher
        
        res = self.client.patch(f"/api/v1/admin/profiles/{researcher_id}", json={
            "role": "admin",
            "lab_id": "cyber_sec"
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(MOCK_DB["last_update"]["role"], "admin")
        self.assertEqual(MOCK_DB["last_update"]["lab_id"], "cyber_sec")

        # Lab Admin tries to access PATCH profiles -> Should fail with 403
        def mock_raise_403():
            raise HTTPException(status_code=403, detail="Superadmin role required.")
        self.app.dependency_overrides[require_superadmin] = mock_raise_403
        
        res = self.client.patch(f"/api/v1/admin/profiles/{researcher_id}", json={
            "role": "superadmin"
        })
        self.assertEqual(res.status_code, 403)

if __name__ == "__main__":
    unittest.main()
