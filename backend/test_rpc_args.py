import os
from supabase import create_client

def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not url or not key:
        print("Error: Missing environment variables")
        return

    supabase = create_client(url, key)
    try:
        res = supabase.rpc("rls_auto_enable", {}).execute()
        print("Success calling RPC:", res.data)
    except Exception as e:
        print("Error calling RPC:", str(e))

if __name__ == "__main__":
    main()
