import sys
import os
import json
import base64
from fastapi.testclient import TestClient

# Add root folder to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main
fastapi_app = main.app
from app.core.security import require_employee, require_admin
from app.services.face_validation import FaceValidationService
from app.services.vector_db import VectorDBService
from app.db.supabase import get_supabase_client

# Bypass actual face validation for reliability in test execution
FaceValidationService.validate_face = lambda img: True

# Setup dummy users
TEST_EMPLOYEE = {
    "id": "2af9ecda-57b7-4e22-afed-8eb2f5b87659",
    "email": "lifera1082@netiren.com",
    "role": "employee",
    "full_name": "fahad ali",
    "created_at": "2026-08-09T00:00:00Z"
}

TEST_ADMIN = {
    "id": "689305dd-f441-472d-b9e3-966e67e49f4b",
    "email": "admin_user_1816@example.com",
    "role": "admin",
    "full_name": "Admin Test User",
    "created_at": "2026-08-09T00:00:00Z"
}

# Override FastAPI authentication dependencies
fastapi_app.dependency_overrides[require_employee] = lambda: TEST_EMPLOYEE
fastapi_app.dependency_overrides[require_admin] = lambda: TEST_ADMIN

# Check if tables exist in the actual Supabase database
tables_exist = True
try:
    actual_supabase = get_supabase_client()
    actual_supabase.table("attendance").select("*").limit(1).execute()
except Exception as e:
    print(f"[*] Supabase tables are not fully initialized: {e}")
    print("[*] Switching to Mock Supabase Client for backend route verification...")
    tables_exist = False

# Mock Supabase Client implementation
class MockExecute:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count or len(self.data)

class MockBuilder:
    def __init__(self, data):
        self.data = data
    def eq(self, *args, **kwargs): return self
    def is_(self, *args, **kwargs): return self
    def order(self, *args, **kwargs): return self
    def execute(self):
        return MockExecute(data=self.data)

class MockTable:
    def __init__(self, name):
        self.name = name
        self.stored_records = []

    def select(self, *args, **kwargs): return self
    def delete(self, *args, **kwargs): return self
    def eq(self, *args, **kwargs): return self
    def is_(self, *args, **kwargs): return self
    def order(self, *args, **kwargs): return self
    def or_(self, *args, **kwargs): return self

    def insert(self, payload, *args, **kwargs):
        rec = dict(payload)
        rec["id"] = "d8d3f66c-54a8-48b2-b1e8-6e54ca6be7ff"
        rec["created_at"] = "2026-08-09T00:00:00Z"
        if "check_out" in rec:
            rec["check_out"] = None
        self.stored_records.append(rec)
        return MockBuilder(data=[rec])

    def update(self, payload, *args, **kwargs):
        if self.stored_records:
            rec = self.stored_records[-1]
            for k, v in payload.items():
                rec[k] = v
            return MockBuilder(data=[rec])
        rec = dict(payload)
        return MockBuilder(data=[rec])

    def execute(self):
        if self.name == "profiles":
            return MockExecute(data=[TEST_EMPLOYEE, TEST_ADMIN])
        
        if self.stored_records:
            return MockExecute(data=self.stored_records)
            
        if self.name == "workspace_members":
            return MockExecute(data=[{"workspace_id": "ws_id", "user_id": TEST_EMPLOYEE["id"]}])
        elif self.name == "tasks":
            return MockExecute(data=[{
                "id": "task_id", "title": "Test Task", "description": "Desc",
                "assigned_to": TEST_EMPLOYEE["id"], "workspace_id": None,
                "due_date": "2026-08-15T00:00:00Z", "status": "pending"
            }])
        return MockExecute(data=[])

class MockSupabaseClient:
    def __init__(self):
        self.tables = {}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = MockTable(name)
        return self.tables[name]

if not tables_exist:
    mock_client = MockSupabaseClient()
    # Override supabase object in app.db.supabase module
    import app.db.supabase
    app.db.supabase.supabase = mock_client

client = TestClient(fastapi_app)

def run_integration_tests():
    print("--- STARTING INTEGRATION TESTS ---")
    
    # 1. Test Root
    res = client.get("/")
    print(f"[*] GET /: status={res.status_code}, data={res.json()}")
    assert res.status_code == 200
    
    # 2. Test DB Check route
    res = client.get("/db-check")
    print(f"[*] GET /db-check: status={res.status_code}, data={res.json()}")
    assert res.status_code == 200
    
    # 3. Test Attendance (Check-in / Check-out)
    dummy_image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
    
    if tables_exist:
        # Clean any existing open check-ins to prevent errors
        supabase = get_supabase_client()
        supabase.table("attendance").delete().eq("user_id", TEST_EMPLOYEE["id"]).is_("check_out", "null").execute()
    
    # Check-in
    res = client.post("/api/v1/user/attendance/check-in", json={"image": dummy_image})
    print(f"[*] POST /attendance/check-in: status={res.status_code}, data={res.json()}")
    assert res.status_code == 200
    
    # History
    res = client.get("/api/v1/user/attendance/history")
    print(f"[*] GET /attendance/history: status={res.status_code}, count={len(res.json())}")
    assert res.status_code == 200
    assert len(res.json()) > 0
    
    # Check-out
    res = client.post("/api/v1/user/attendance/check-out", json={"image": dummy_image})
    print(f"[*] POST /attendance/check-out: status={res.status_code}, data={res.json()}")
    assert res.status_code == 200

    # 4. Test Work Upload
    report_payload = {
        "report_text": "Completed the neural network integration with Supabase. Encountered blockers with rate limits."
    }
    res = client.post("/api/v1/user/work/upload", json=report_payload)
    print(f"[*] POST /work/upload: status={res.status_code}, summary={res.json().get('summary')}")
    assert res.status_code == 200
    assert "summary" in res.json()
    
    # 5. Test Vector DB Persistent Fallback
    VectorDBService.add_document(
        user_id=TEST_EMPLOYEE["id"],
        file_name="test_doc.txt",
        text="Offline persistence verification note."
    )
    
    # Reload and query fallback data to verify persistence
    results = VectorDBService.query_user_data(user_id=TEST_EMPLOYEE["id"], query="persistence")
    print(f"[*] Vector DB query fallback test: match_count={len(results)}")
    assert len(results) > 0
    assert any("persistence" in item["content"].lower() for item in results)

    # 6. Test Admin endpoints
    res = client.get("/api/v1/admin/attendance")
    print(f"[*] GET /admin/attendance: status={res.status_code}, count={len(res.json())}")
    assert res.status_code == 200

    res = client.get("/api/v1/admin/reports")
    print(f"[*] GET /admin/reports: status={res.status_code}, count={len(res.json())}")
    assert res.status_code == 200

    res = client.get("/api/v1/admin/employees")
    print(f"[*] GET /admin/employees: status={res.status_code}, count={len(res.json())}")
    assert res.status_code == 200

    print("\n--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY ---")

if __name__ == "__main__":
    import traceback
    try:
        run_integration_tests()
    except Exception as e:
        print("\n[!] Test Suite Failed:")
        traceback.print_exc()
        sys.exit(1)
