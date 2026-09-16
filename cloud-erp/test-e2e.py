#!/usr/bin/env python3
"""
End-to-End Test: CloudERP/NetCloudX
Tests: Sales Flow, Purchase Flow, GL Posting, Journal Entry, Manufacturing
"""
import urllib.request
import urllib.error
import json
import sys

BASE = "http://localhost:4100/api"

def api(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())
    except Exception as ex:
        return {"success": False, "error": str(ex)}

def check(label, result, key=None):
    if result.get("success"):
        val = result.get("data", {})
        if key:
            val = val.get(key, val)
        print(f"  ✅ {label}: {val}")
        return result["data"]
    else:
        print(f"  ❌ {label}: {result.get('error')}")
        return None

print("=" * 60)
print("  CloudERP/NetCloudX - End-to-End Test")
print("=" * 60)

# LOGIN
print("\n[1] Authentication")
r = api("POST", "/auth/login", {"email": "admin@cloudmfg.co.id", "password": "CloudERP@2026", "companyCode": "CMI"})
token = r.get("data", {}).get("token")
if not token:
    print("  ❌ Login failed:", r.get("error"))
    sys.exit(1)
print(f"  ✅ Login OK | User: {r['data']['user']['name']} | Company: {r['data']['user']['companyName']}")

# GET MASTER DATA
print("\n[2] Master Data")
customers = api("GET", "/customers?limit=10", token=token)
vendors = api("GET", "/vendors?limit=10", token=token)
items = api("GET", "/items?limit=10", token=token)
locations = api("GET", "/settings/locations", token=token)
accounts = api("GET", "/accounting/accounts", token=token)

CUST = customers["data"][0]["id"] if customers.get("data") else None
VENDOR = vendors["data"][0]["id"] if vendors.get("data") else None
ITEM = items["data"][0]["id"] if items.get("data") else None
LOC = locations["data"][0]["id"] if locations.get("data") else None

print(f"  ✅ Customers: {customers.get('total', 0)} | Vendors: {vendors.get('total', 0)} | Items: {items.get('total', 0)} | Locations: {len(locations.get('data', []))}")
print(f"  ✅ Chart of Accounts: {len(accounts.get('data', []))} accounts")

if not all([CUST, VENDOR, ITEM, LOC]):
    print("  ❌ Missing master data - cannot proceed")
    sys.exit(1)

# SALES FLOW
print("\n[3] Sales Flow: SO → Approve → Fulfill → Invoice (GL) → Payment (GL)")

so = api("POST", "/sales/orders", {
    "customerId": CUST, "orderDate": "2026-09-02",
    "currency": "IDR", "paymentTerms": "Net30", "locationId": LOC,
    "memo": "E2E Test Order",
    "lines": [{"itemId": ITEM, "description": "Test Product", "quantity": 10, "unitPrice": 500000, "taxAmount": 550000}]
}, token)
so_data = check("Sales Order Created", so, "so_number")
if not so_data:
    print("  Stopping sales flow test")
else:
    SO_ID = so["data"]["id"]

    appr = api("POST", f"/sales/orders/{SO_ID}/approve", {}, token)
    check("SO Approved", appr, "status")

    lines = api("GET", f"/sales/orders/{SO_ID}", token=token)
    SOL_ID = lines["data"]["lines"][0]["id"] if lines.get("data") else None

    ff = api("POST", f"/sales/orders/{SO_ID}/fulfill", {
        "fulfillmentDate": "2026-09-02", "locationId": LOC,
        "lines": [{"soLineId": SOL_ID, "itemId": ITEM, "quantity": 10}]
    }, token)
    check("Item Fulfillment", ff, "fulfillment_number")

    inv = api("POST", f"/sales/orders/{SO_ID}/invoice", {"invoiceDate": "2026-09-02"}, token)
    inv_data = check("Invoice + GL Posted", inv, "invoice_number")

    if inv.get("success"):
        INV_ID = inv["data"]["id"]
        gl_posted = inv["data"]["is_posted"]
        print(f"  ✅ GL Auto-Post: {gl_posted} | Amount Due: {inv['data']['amount_due']}")

        pay = api("POST", "/sales/payments", {
            "customerId": CUST, "paymentDate": "2026-09-02",
            "paymentMethod": "bank_transfer", "amount": 5550000,
            "applications": [{"invoiceId": INV_ID, "amount": 5550000}]
        }, token)
        check("Customer Payment + GL", pay, "payment_number")

        final_inv = api("GET", f"/sales/invoices/{INV_ID}", token=token)
        if final_inv.get("success"):
            inv_status = final_inv["data"]["status"]
            gl_entries = len(final_inv["data"].get("journalEntries", []))
            print(f"  ✅ Invoice Final: status={inv_status} | GL Entries={gl_entries}")

# PURCHASE FLOW
print("\n[4] Purchase Flow: PO → Approve → Receive → Bill (GL) → Vendor Payment (GL)")

po = api("POST", "/purchasing/orders", {
    "vendorId": VENDOR, "orderDate": "2026-09-02",
    "currency": "IDR", "paymentTerms": "Net30", "locationId": LOC,
    "lines": [{"itemId": ITEM, "description": "Raw Material", "quantity": 50, "unitPrice": 80000, "taxAmount": 400000}]
}, token)
po_data = check("Purchase Order Created", po, "po_number")

if po_data:
    PO_ID = po["data"]["id"]
    appr = api("POST", f"/purchasing/orders/{PO_ID}/approve", {}, token)
    check("PO Approved", appr, "status")

    po_detail = api("GET", f"/purchasing/orders/{PO_ID}", token=token)
    POL_ID = po_detail["data"]["lines"][0]["id"] if po_detail.get("data") else None

    rcpt = api("POST", f"/purchasing/orders/{PO_ID}/receive", {
        "receiptDate": "2026-09-02", "locationId": LOC,
        "lines": [{"poLineId": POL_ID, "itemId": ITEM, "quantity": 50, "unitCost": 80000}]
    }, token)
    check("Item Receipt", rcpt, "receipt_number")

    bill = api("POST", f"/purchasing/orders/{PO_ID}/bill", {"billDate": "2026-09-02"}, token)
    bill_data = check("Vendor Bill + GL Posted", bill, "bill_number")
    if bill.get("success"):
        print(f"  ✅ Bill GL Post: {bill['data']['is_posted']} | Total: {bill['data']['total_amount']}")
        BILL_ID = bill["data"]["id"]

        vp = api("POST", "/purchasing/vendor-payments", {
            "vendorId": VENDOR, "paymentDate": "2026-09-02",
            "paymentMethod": "bank_transfer", "amount": 4400000,
            "applications": [{"billId": BILL_ID, "amount": 4400000}]
        }, token)
        check("Vendor Payment + GL", vp, "payment_number")

# JOURNAL ENTRY (Manual GL)
print("\n[5] Manual Journal Entry (Double-Entry GL)")

accounts_list = accounts.get("data", [])
dr_acct = next((a["id"] for a in accounts_list if a["code"] == "6200"), None) or \
          next((a["id"] for a in accounts_list if a["type"] == "expense"), None)
cr_acct = next((a["id"] for a in accounts_list if a["code"] == "1020"), None) or \
          next((a["id"] for a in accounts_list if a["type"] == "asset" and "bank" in a["name"].lower()), None)

if dr_acct and cr_acct:
    je = api("POST", "/accounting/journals", {
        "entryDate": "2026-09-02", "currency": "IDR",
        "memo": "E2E Test - Office Supplies",
        "lines": [
            {"accountId": dr_acct, "debit": 1000000, "credit": 0, "memo": "Office Supplies Expense"},
            {"accountId": cr_acct, "debit": 0, "credit": 1000000, "memo": "Paid from Bank"}
        ]
    }, token)
    je_data = check("Manual Journal Entry", je, "journal_number")
    if je.get("success"):
        print(f"  ✅ GL Status: {je['data']['status']}")
else:
    print("  ⚠️  Skipping - could not find expense/bank accounts")

# MANUFACTURING
print("\n[6] Manufacturing: BOM → Work Order")

finished_goods = [i for i in items.get("data", []) if i.get("type") in ["finished_good", "assembly", "inventory"]]
FG_ITEM = finished_goods[0]["id"] if finished_goods else ITEM

boms = api("GET", "/manufacturing/boms", token=token)
BOM_ID = boms["data"][0]["id"] if boms.get("data") else None
print(f"  ✅ BOMs available: {boms.get('total', 0)}")

wo = api("POST", "/manufacturing/work-orders", {
    "itemId": FG_ITEM, "bomId": BOM_ID or "", "quantity": 100,
    "plannedStartDate": "2026-09-02", "plannedEndDate": "2026-09-05",
    "locationId": LOC, "priority": "normal",
    "memo": "E2E Test Work Order"
}, token)
wo_data = check("Work Order Created", wo, "wo_number")

# DASHBOARD
print("\n[7] Dashboard & Reports")
dashboard = api("GET", "/reports/dashboard", token=token)
if dashboard.get("success"):
    kpis = dashboard["data"].get("kpis", {})
    print(f"  ✅ Revenue MTD: {kpis.get('revenueMTD', 0):,.0f}")
    print(f"  ✅ Open AR: {kpis.get('openAR', 0):,.0f}")
    print(f"  ✅ Open AP: {kpis.get('openAP', 0):,.0f}")
    print(f"  ✅ Open SO: {kpis.get('openSOCount', 0)}")
    print(f"  ✅ Open PO: {kpis.get('openPOCount', 0)}")
else:
    print(f"  ❌ Dashboard: {dashboard.get('error')}")

tb = api("GET", "/accounting/reports/trial-balance?dateFrom=2026-01-01&dateTo=2026-12-31", token=token)
if tb.get("success"):
    td = tb["data"]
    print(f"  ✅ Trial Balance: Debit={td['totalDebit']:,.0f} | Credit={td['totalCredit']:,.0f} | Balanced={td['isBalanced']}")

# GL Journal Count
journals = api("GET", "/accounting/journals", token=token)
print(f"  ✅ Total GL Journal Entries: {journals.get('total', 0)}")

print("\n" + "=" * 60)
print("  END-TO-END TEST COMPLETE")
print("=" * 60)
print("\nNetCloudX/CloudERP:")
print("  Frontend: http://localhost:5173")
print("  Backend:  http://localhost:4100")
print("  Login:    admin@cloudmfg.co.id / CloudERP@2026 / CMI")
