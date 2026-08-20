import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from app.core.security import require_employee, require_admin
from app.db.supabase import get_supabase_client
from uuid import UUID

# Mock users
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

app.dependency_overrides[require_employee] = lambda: TEST_EMPLOYEE
app.dependency_overrides[require_admin] = lambda: TEST_ADMIN

client = TestClient(app)

try:
    supabase = get_supabase_client()

    # 1. Test DM Workspace creation (this inserts the user profile if missing)
    print("Testing Admin DM Workspace creation with full name...")
    
    # Let's ensure the employee profile exists in the DB so we can fetch their full name
    supabase.table("profiles").upsert({
        "id": TEST_EMPLOYEE["id"],
        "email": TEST_EMPLOYEE["email"],
        "full_name": TEST_EMPLOYEE["full_name"],
        "role": TEST_EMPLOYEE["role"]
    }).execute()

    res = client.post(f"/api/v1/admin/employees/{TEST_EMPLOYEE['id']}/direct-message", json={"message": "Hey there"})
    print(f"Admin DM status: {res.status_code}")
    print(f"Admin DM response: {res.json()}")
    assert res.status_code == 200

    # Query workspaces to check if workspace named "DM: Admin & fahad ali" exists
    ws_resp = supabase.table("workspaces").select("*").eq("name", f"DM: Admin & {TEST_EMPLOYEE['full_name']}").execute()
    print(f"DM Workspaces found: {ws_resp.data}")
    assert len(ws_resp.data) > 0
    workspace_id = ws_resp.data[0]["id"]

    # 2. Test POST message endpoint
    print("Testing message posting...")
    
    # Send message with JSON body
    res = client.post(f"/api/v1/user/workspaces/{workspace_id}/messages", json={"content": "Hello from custom test"})
    print(f"Message post response status: {res.status_code}")
    print(f"Message post response JSON: {res.json()}")
    assert res.status_code == 200
    assert res.json()["content"] == "Hello from custom test"

    print("\n--- ALL CUSTOM CHAT VERIFICATIONS PASSED SUCCESSFULLY ---")
except Exception as e:
    import traceback
    print("\n[!] Custom verification failed:")
    traceback.print_exc()
    sys.exit(1)
