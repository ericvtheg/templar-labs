"""Guard and verify retirement of only Hello World's Cloudflare resources."""
import json
import os
import sys
import urllib.request

account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
base = f"https://api.cloudflare.com/client/v4/accounts/{account}"
headers = {"Authorization": f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}"}


def get(path):
    request = urllib.request.Request(base + path, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    assert payload.get("success"), f"Cloudflare request failed: {path}"
    return payload


def pages(path):
    records = []
    page = 1
    while True:
        payload = get(f"{path}?page={page}&per_page=100")
        records.extend(payload["result"])
        info = payload.get("result_info", {})
        if page >= info.get("total_pages", 1):
            return records
        page += 1


databases = pages("/d1/database")
workers = get("/workers/scripts")["result"]
targets = [db for db in databases if db["name"] == "hello-world-db"]
if sys.argv[1] == "before":
    assert len(targets) <= 1, "Unexpected duplicate hello-world-db"
    if not targets:
        assert not any(w["id"] == "hello-world-website" for w in workers), "Database missing but Worker remains"
        print("Hello World database and Worker already removed.")
        sys.exit(0)
    target_id = targets[0]["uuid"]
    for worker in workers:
        bindings = get(f"/workers/scripts/{worker['id']}/settings")["result"]["bindings"]
        for binding in bindings:
            if binding.get("type") == "d1" and binding.get("id") == target_id:
                assert worker["id"] == "hello-world-website", f"Shared database: {worker['id']}"
    print("Verified hello-world-db has no bindings from other Workers.")
    print(f"Database count before retirement: {len(databases)}")
elif sys.argv[1] == "after":
    assert not targets, "hello-world-db still exists"
    assert not any(w["id"] == "hello-world-website" for w in workers), "Worker still exists"
    queues = pages("/queues")
    assert not any(q["queue_name"] == "hello-world-jobs" for q in queues), "Queue still exists"
    buckets = get("/r2/buckets")["result"]["buckets"]
    if any(b["name"] == "hello-world-r2" for b in buckets):
        print("Retained nonempty hello-world-r2 bucket to preserve existing files.")
    print("Verified Hello World database, Worker and queue are absent.")
    print(f"Database count after retirement: {len(databases)}")
else:
    raise ValueError("Expected before or after")
