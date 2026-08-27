import os
import requests

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    rest_url = f"{url}/rest/v1/"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
    
    try:
        res = requests.get(rest_url, headers=headers)
        if res.status_code == 200:
            schema = res.json()
            paths = schema.get("paths", {})
            rls_path = paths.get("/rpc/rls_auto_enable", {})
            print("Info for /rpc/rls_auto_enable:")
            import json
            print(json.dumps(rls_path, indent=2))
        else:
            print("Failed to fetch schema:", res.status_code)
    except Exception as e:
        print("Error:", str(e))

if __name__ == "__main__":
    main()
