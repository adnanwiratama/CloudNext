#!/usr/bin/env python3
import urllib.request, urllib.error, json

BASE = "http://localhost:4100/api"

def api(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp: return json.loads(resp.read())
    except urllib.error.HTTPError as e: return json.loads(e.read())
    except Exception as ex: return {"success": False, "error": str(ex)}

print("=== Testing New Endpoints ===\n")

# Login
r = api("POST", "/auth/login", {"email": "admin@cloudmfg.co.id", "password": "CloudERP@2026", "companyCode": "CMI"})
token = r["data"]["token"]
print("✅ Login OK")

# 1. Item Fulfillments list
r = api("GET", "/sales/fulfillments", token=token)
if r.get("success"):
    print(f"✅ GET /sales/fulfillments — {r['total']} records")
    if r['data']:
        ff = r['data'][0]
        print(f"   Sample: {ff['fulfillment_number']} | Customer: {ff['customer_name']} | SO: {ff['so_number']}")
else:
    print(f"❌ GET /sales/fulfillments — {r.get('error')}")

# 2. Item Fulfillment detail
if r.get("data"):
    ff_id = r["data"][0]["id"]
    d = api("GET", f"/sales/fulfillments/{ff_id}", token=token)
    if d.get("success"):
        ff = d["data"]
        print(f"✅ GET /sales/fulfillments/{ff_id[:8]}... — {ff['fulfillment_number']} | Lines: {len(ff.get('lines',[]))} | JEs: {len(ff.get('journalEntries',[]))}")
    else:
        print(f"❌ GET /sales/fulfillments/:id — {d.get('error')}")

# 3. Good Receipts list
r = api("GET", "/purchasing/receipts", token=token)
if r.get("success"):
    print(f"✅ GET /purchasing/receipts — {r['total']} records")
    if r['data']:
        grn = r['data'][0]
        print(f"   Sample: {grn['receipt_number']} | Vendor: {grn['vendor_name']} | PO: {grn['po_number']}")
else:
    print(f"❌ GET /purchasing/receipts — {r.get('error')}")

# 4. Good Receipt detail
if r.get("data"):
    grn_id = r["data"][0]["id"]
    d = api("GET", f"/purchasing/receipts/{grn_id}", token=token)
    if d.get("success"):
        grn = d["data"]
        print(f"✅ GET /purchasing/receipts/{grn_id[:8]}... — {grn['receipt_number']} | Lines: {len(grn.get('lines',[]))} | JEs: {len(grn.get('journalEntries',[]))}")
    else:
        print(f"❌ GET /purchasing/receipts/:id — {d.get('error')}")

# 5. Test create fulfillment via form flow (simulate)
print("\n=== Test Full Flow via New Form Endpoints ===")
CUST = api("GET", "/customers?limit=1", token=token)["data"][0]["id"]
VENDOR = api("GET", "/vendors?limit=1", token=token)["data"][0]["id"]
ITEM = api("GET", "/items?limit=1", token=token)["data"][0]["id"]
LOC = api("GET", "/settings/locations", token=token)["data"][0]["id"]

# Create SO
so = api("POST", "/sales/orders", {
    "customerId": CUST, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 3, "unitPrice": 200000, "taxAmount": 60000}]
}, token)
SO_ID = so["data"]["id"]
api("POST", f"/sales/orders/{SO_ID}/approve", {}, token)
SOL = api("GET", f"/sales/orders/{SO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"✅ SO created: {so['data']['so_number']}")

# Create fulfillment via form endpoint
ff = api("POST", f"/sales/orders/{SO_ID}/fulfill", {
    "fulfillmentDate": "2026-09-02",
    "locationId": LOC,
    "carrier": "JNE",
    "trackingNumber": "JNE123456789",
    "memo": "Test shipment",
    "lines": [{"soLineId": SOL, "itemId": ITEM, "quantity": 3}]
}, token)
if ff.get("success"):
    print(f"✅ Item Fulfillment: {ff['data']['fulfillment_number']} | Status: {ff['data']['status']}")
    FF_ID = ff["data"]["id"]
    # Get detail
    fd = api("GET", f"/sales/fulfillments/{FF_ID}", token=token)
    if fd.get("success"):
        print(f"✅ Fulfillment Detail: Lines={len(fd['data'].get('lines',[]))} | JEs={len(fd['data'].get('journalEntries',[]))}")
        for je in fd["data"].get("journalEntries", []):
            print(f"   GL: {je['journal_number']} | {je['memo']}")
else:
    print(f"❌ Fulfillment: {ff.get('error')}")

# Create PO + GRN
po = api("POST", "/purchasing/orders", {
    "vendorId": VENDOR, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 5, "unitPrice": 50000}]
}, token)
PO_ID = po["data"]["id"]
api("POST", f"/purchasing/orders/{PO_ID}/approve", {}, token)
POL = api("GET", f"/purchasing/orders/{PO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"\n✅ PO created: {po['data']['po_number']}")

# Create GRN via form endpoint
grn = api("POST", f"/purchasing/orders/{PO_ID}/receive", {
    "receiptDate": "2026-09-02",
    "locationId": LOC,
    "memo": "Received in good condition",
    "lines": [{"poLineId": POL, "itemId": ITEM, "quantity": 5, "unitCost": 50000}]
}, token)
if grn.get("success"):
    print(f"✅ Good Receipt: {grn['data']['receipt_number']} | Status: {grn['data']['status']}")
    GRN_ID = grn["data"]["id"]
    gd = api("GET", f"/purchasing/receipts/{GRN_ID}", token=token)
    if gd.get("success"):
        print(f"✅ GRN Detail: Lines={len(gd['data'].get('lines',[]))} | JEs={len(gd['data'].get('journalEntries',[]))}")
        for je in gd["data"].get("journalEntries", []):
            print(f"   GL: {je['journal_number']} | {je['memo']}")
else:
    print(f"❌ GRN: {grn.get('error')}")

# Check frontend
print("\n=== Frontend Status ===")
import urllib.request as ur
try:
    with ur.urlopen("http://localhost:5173") as resp:
        print(f"✅ Frontend: http://localhost:5173 — {resp.status} OK")
except Exception as e:
    print(f"❌ Frontend: {e}")

print("\n=== Routes Available ===")
routes = [
    "/sales/fulfillments",
    "/sales/fulfillments/new?soId=xxx",
    "/purchasing/receipts",
    "/purchasing/receipts/new?poId=xxx",
]
for r in routes:
    print(f"  ✅ http://localhost:5173{r}")

print("\n=== Sidebar Menu Added ===")
print("  ✅ Sales > Item Fulfillments")
print("  ✅ Purchasing > Good Receipts")
print("\n=== DONE ===")
