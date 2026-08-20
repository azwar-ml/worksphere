from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "WorkSphere AI" in data["project"]

def test_db_check():
    response = client.get("/db-check")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
