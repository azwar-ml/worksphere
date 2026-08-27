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
    "id": "b99453c3-c71c-4d4b-876b-8f40583bc6d8",
    "email": "fahad.ai@ncai.gov",
    "role": "employee",
    "full_name": "fahad",
    "created_at": "2026-08-09T00:00:00Z"
}

TEST_ADMIN = {
    "id": "1ac3b48c-c090-48f4-827d-5d57f0eae042",
    "email": "admin.ai@ncai.gov",
    "role": "admin",
    "full_name": "ADMIN (AI)",
    "created_at": "2026-08-09T00:00:00Z"
}

app.dependency_overrides[require_employee] = lambda: TEST_EMPLOYEE
app.dependency_overrides[require_admin] = lambda: TEST_ADMIN

client = TestClient(app)

try:
    supabase = get_supabase_client()
    
    # Ensure profile exists
    supabase.table("profiles").upsert({
        "id": TEST_EMPLOYEE["id"],
        "email": TEST_EMPLOYEE["email"],
        "full_name": TEST_EMPLOYEE["full_name"],
        "role": TEST_EMPLOYEE["role"]
    }).execute()

    print("1. Testing POST /api/v1/admin/chat/{employee_id}")
    post_res = client.post(
        f"/api/v1/admin/chat/{TEST_EMPLOYEE['id']}",
        json={"content": "Admin test message via new endpoint"}
    )
    print(f"POST response status: {post_res.status_code}")
    print(f"POST response JSON: {post_res.json()}")
    assert post_res.status_code == 200
    assert post_res.json()["content"] == "Admin test message via new endpoint"
    assert post_res.json()["full_name"] == TEST_ADMIN["full_name"]

    print("2. Testing GET /api/v1/admin/chat/{employee_id}")
    get_res = client.get(f"/api/v1/admin/chat/{TEST_EMPLOYEE['id']}")
    print(f"GET response status: {get_res.status_code}")
    messages = get_res.json()
    print(f"GET response count: {len(messages)}")
    assert get_res.status_code == 200
    assert len(messages) > 0
    assert any(m["content"] == "Admin test message via new endpoint" for m in messages)

    print("\n--- ALL ADMIN TWO-WAY CHAT VERIFICATIONS PASSED SUCCESSFULLY ---")
except Exception as e:
    import traceback
    print("\n[!] Admin Chat verification failed:")
    traceback.print_exc()
    sys.exit(1)
