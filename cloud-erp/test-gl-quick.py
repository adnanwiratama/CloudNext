#!/usr/bin/env python3
import urllib.request, urllib.error, json, sys

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

def dr_cr(l):
    dr = float(l.get('debit_base') or 0)
    cr = float(l.get('credit_base') or 0)
    return f"Dr {dr:>12,.0f}  Cr {cr:>12,.0f}"

print("=== GL Flow Test ===\n")

# Login
r = api("POST", "/auth/login", {"email": "admin@cloudmfg.co.id", "password": "CloudERP@2026", "companyCode": "CMI"})
token = r["data"]["token"]
print("✅ Login OK")

customers = api("GET", "/customers?limit=1", token=token)["data"]
vendors = api("GET", "/vendors?limit=1", token=token)["data"]
items = api("GET", "/items?limit=1", token=token)["data"]
locs = api("GET", "/settings/locations", token=token)["data"]
CUST, VENDOR, ITEM, LOC = customers[0]["id"], vendors[0]["id"], items[0]["id"], locs[0]["id"]

# --- TEST 1: Sales + Fulfillment + Invoice ---
print("\n[TEST 1] Sales: SO → Fulfill (Dr COGS Cr FG) → Invoice (Dr AR Cr Rev)")

so = api("POST", "/sales/orders", {
    "customerId": CUST, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 2, "unitPrice": 1000000, "taxAmount": 200000}]
}, token)
SO_ID = so["data"]["id"]
api("POST", f"/sales/orders/{SO_ID}/approve", {}, token)
sol = api("GET", f"/sales/orders/{SO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"  SO: {so['data']['so_number']}")

je_count_before = api("GET", "/accounting/journals", token=token)["total"]

# Fulfill
ff = api("POST", f"/sales/orders/{SO_ID}/fulfill", {
    "fulfillmentDate": "2026-09-02", "locationId": LOC,
    "lines": [{"soLineId": sol, "itemId": ITEM, "quantity": 2}]
}, token)
print(f"  Fulfillment: {ff['data']['fulfillment_number']}")

je_count_ff = api("GET", "/accounting/journals", token=token)["total"]
if je_count_ff > je_count_before:
    latest = api("GET", "/accounting/journals?limit=5", token=token)["data"]
    ff_je = next((j for j in latest if j.get("source_type") == "item_fulfillment"), None)
    if ff_je:
        lines = api("GET", f"/accounting/journals/{ff_je['id']}", token=token)["data"]["lines"]
        print(f"  ✅ Fulfillment GL ({ff_je['journal_number']}): {len(lines)} lines")
        for l in lines:
            print(f"     {l['account_code']} {l['account_name'][:25]:25} | {dr_cr(l)} | {l['memo']}")
        cogs_dr = any(l['account_code'] == '5100' and float(l.get('debit_base') or 0) > 0 for l in lines)
        fg_cr = any(l['account_code'] == '1230' and float(l.get('credit_base') or 0) > 0 for l in lines)
        print(f"  {'✅' if cogs_dr else '❌'} Dr COGS (5100)  |  {'✅' if fg_cr else '❌'} Cr Finished Goods (1230)")
    else:
        print("  ℹ️  No COGS JE (item has zero cost)")
else:
    print("  ℹ️  No GL posted for fulfillment (zero cost items)")

# Invoice
inv = api("POST", f"/sales/orders/{SO_ID}/invoice", {"invoiceDate": "2026-09-02"}, token)
print(f"\n  Invoice: {inv['data']['invoice_number']} | GL Posted: {inv['data']['is_posted']}")

latest2 = api("GET", "/accounting/journals?limit=5", token=token)["data"]
inv_je = next((j for j in latest2 if j.get("source_type") == "invoice"), None)
if inv_je:
    lines = api("GET", f"/accounting/journals/{inv_je['id']}", token=token)["data"]["lines"]
    print(f"  ✅ Invoice GL ({inv_je['journal_number']}): {len(lines)} lines")
    for l in lines:
        print(f"     {l['account_code']} {l['account_name'][:25]:25} | {dr_cr(l)} | {l['memo']}")
    has_cogs = any(l['account_code'] in ['5100','5200'] for l in lines)
    has_ar = any(l['account_code'] == '1100' and float(l.get('debit_base') or 0) > 0 for l in lines)
    has_rev = any(l['account_code'] == '4100' and float(l.get('credit_base') or 0) > 0 for l in lines)
    print(f"  {'❌ COGS in Invoice!' if has_cogs else '✅ No COGS (correct)'}  |  {'✅' if has_ar else '❌'} Dr AR  |  {'✅' if has_rev else '❌'} Cr Revenue")

# --- TEST 2: Purchase: PO → GRN (Dr Inv Cr AccruedAP) → Bill (Dr AccruedAP Cr AP) ---
print("\n[TEST 2] Purchase: PO → GRN (Dr Inv Cr AccruedAP 2110) → Bill (Dr AccruedAP Cr AP 2100)")

po = api("POST", "/purchasing/orders", {
    "vendorId": VENDOR, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 10, "unitPrice": 75000, "taxAmount": 75000}]
}, token)
PO_ID = po["data"]["id"]
api("POST", f"/purchasing/orders/{PO_ID}/approve", {}, token)
pol = api("GET", f"/purchasing/orders/{PO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"  PO: {po['data']['po_number']}")

# Receive
rcpt = api("POST", f"/purchasing/orders/{PO_ID}/receive", {
    "receiptDate": "2026-09-02", "locationId": LOC,
    "lines": [{"poLineId": pol, "itemId": ITEM, "quantity": 10, "unitCost": 75000}]
}, token)
print(f"  GRN: {rcpt['data']['receipt_number']}")

latest3 = api("GET", "/accounting/journals?limit=5", token=token)["data"]
grn_je = next((j for j in latest3 if j.get("source_type") == "item_receipt"), None)
if grn_je:
    lines = api("GET", f"/accounting/journals/{grn_je['id']}", token=token)["data"]["lines"]
    print(f"  ✅ GRN GL ({grn_je['journal_number']}): {len(lines)} lines")
    for l in lines:
        print(f"     {l['account_code']} {l['account_name'][:25]:25} | {dr_cr(l)} | {l['memo']}")
    inv_dr = any(l['account_code'] in ['1200','1210'] and float(l.get('debit_base') or 0) > 0 for l in lines)
    acc_cr = any(l['account_code'] == '2110' and float(l.get('credit_base') or 0) > 0 for l in lines)
    print(f"  {'✅' if inv_dr else '❌'} Dr Inventory  |  {'✅' if acc_cr else '❌'} Cr Accrued AP (2110)")
else:
    print("  ❌ No GRN GL found")

# Bill
bill = api("POST", f"/purchasing/orders/{PO_ID}/bill", {"billDate": "2026-09-02"}, token)
BILL_ID = bill["data"]["id"]
print(f"\n  Bill: {bill['data']['bill_number']} | GL Posted: {bill['data']['is_posted']}")

latest4 = api("GET", "/accounting/journals?limit=5", token=token)["data"]
bill_je = next((j for j in latest4 if j.get("source_type") == "vendor_bill"), None)
if bill_je:
    lines = api("GET", f"/accounting/journals/{bill_je['id']}", token=token)["data"]["lines"]
    print(f"  ✅ Bill GL ({bill_je['journal_number']}): {len(lines)} lines")
    for l in lines:
        print(f"     {l['account_code']} {l['account_name'][:25]:25} | {dr_cr(l)} | {l['memo']}")
    acc_dr = any(l['account_code'] == '2110' and float(l.get('debit_base') or 0) > 0 for l in lines)
    ap_cr = any(l['account_code'] == '2100' and float(l.get('credit_base') or 0) > 0 for l in lines)
    print(f"  {'✅' if acc_dr else '❌'} Dr Accrued AP (2110)  |  {'✅' if ap_cr else '❌'} Cr Accounts Payable (2100)")
else:
    print("  ❌ No Bill GL found")

# Bill Detail API
print(f"\n  Bill Detail API: /api/purchasing/bills/{BILL_ID}")
bd = api("GET", f"/purchasing/bills/{BILL_ID}", token=token)
if bd.get("success"):
    b = bd["data"]
    print(f"  ✅ Bill Detail OK | Lines: {len(b.get('lines',[]))} | JEs: {len(b.get('journalEntries',[]))} | Due: {float(b['amount_due']):,.0f}")
else:
    print(f"  ❌ Bill Detail: {bd.get('error')}")

# Trial Balance
print("\n=== Final Trial Balance ===")
tb = api("GET", "/accounting/reports/trial-balance?dateFrom=2026-01-01&dateTo=2026-12-31", token=token)
if tb.get("success"):
    d = tb["data"]
    print(f"  Debit: {d['totalDebit']:,.0f} | Credit: {d['totalCredit']:,.0f} | Balanced: {d['isBalanced']}")
    print(f"  Total GL Entries: {api('GET', '/accounting/journals', token=token)['total']}")

print("\n=== DONE ===")
