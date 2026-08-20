import sys
from fastapi.testclient import TestClient

try:
    # Add root folder to path
    sys.path.append(".")
    from main import app
    
    client = TestClient(app)
    
    # Test Root
    res = client.get("/")
    print(f"Root endpoint status: {res.status_code}")
    print(f"Root response: {res.json()}")
    assert res.status_code == 200
    
    # Test DB check route (verifies supabase client initialization is valid)
    res_db = client.get("/db-check")
    print(f"DB check status: {res_db.status_code}")
    print(f"DB check response: {res_db.json()}")
    assert res_db.status_code == 200
    
    print("\n--- ALL BACKEND VERIFICATIONS PASSED ---")
except Exception as e:
    print(f"Backend verification failed: {e}")
    sys.exit(1)
