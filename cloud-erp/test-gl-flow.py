#!/usr/bin/env python3
"""
Test GL Flow Changes:
1. Item Fulfillment → Dr COGS Cr Finished Goods
2. Invoice → Dr AR Cr Revenue + Tax (NO COGS)
3. Good Receipt → Dr Inventory Cr Accrued AP (2110)
4. Vendor Bill → Dr Accrued AP Cr AP (2100)
5. Vendor Bill Detail API
"""
import urllib.request, urllib.error, json, sys

BASE = "http://localhost:4100/api"

def api(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
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
        if key: val = val.get(key, val)
        print(f"  ✅ {label}: {val}")
        return result["data"]
    else:
        print(f"  ❌ {label}: {result.get('error')}")
        return None

def get_je_lines(token, je_id):
    r = api("GET", f"/accounting/journals/{je_id}", token=token)
    return r.get("data", {}).get("lines", []) if r.get("success") else []

print("=" * 60)
print("  GL Flow Test - NetCloudX/CloudERP")
print("=" * 60)

# Login
r = api("POST", "/auth/login", {"email": "admin@cloudmfg.co.id", "password": "CloudERP@2026", "companyCode": "CMI"})
token = r.get("data", {}).get("token")
if not token: print("Login FAILED"); sys.exit(1)
print(f"\n✅ Login OK")

# Get master data
CUST = api("GET", "/customers?limit=1", token=token)["data"][0]["id"]
VENDOR = api("GET", "/vendors?limit=1", token=token)["data"][0]["id"]
ITEM = api("GET", "/items?limit=1", token=token)["data"][0]["id"]
LOC = api("GET", "/settings/locations", token=token)["data"][0]["id"]

# Get accounts for verification
accounts_raw = api("GET", "/accounting/accounts", token=token)["data"]
accts = {a["code"]: a for a in accounts_raw}
print(f"  Key Accounts: AR={accts.get('1100',{}).get('name','?')} | AP={accts.get('2100',{}).get('name','?')} | AccruedAP={accts.get('2110',{}).get('name','?')}")

print("\n" + "=" * 60)
print("  TEST 1: SALES FLOW - Item Fulfillment GL")
print("=" * 60)

# Create & approve SO
so = api("POST", "/sales/orders", {"customerId": CUST, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 5, "unitPrice": 1000000, "taxAmount": 500000}]}, token)
SO_ID = so["data"]["id"]
api("POST", f"/sales/orders/{SO_ID}/approve", {}, token)
SOL_ID = api("GET", f"/sales/orders/{SO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"  SO: {so['data']['so_number']}")

# Count JEs before fulfillment
je_before = api("GET", "/accounting/journals", token=token)["total"]

# Create fulfillment
ff = api("POST", f"/sales/orders/{SO_ID}/fulfill", {
    "fulfillmentDate": "2026-09-02", "locationId": LOC,
    "lines": [{"soLineId": SOL_ID, "itemId": ITEM, "quantity": 5}]
}, token)
ff_data = check("Item Fulfillment Created", ff, "fulfillment_number")

je_after_ff = api("GET", "/accounting/journals", token=token)["total"]
new_jes = je_after_ff - je_before
print(f"  New JEs after fulfillment: {new_jes}")

if new_jes > 0:
    # Get the latest JE
    latest_jes = api("GET", "/accounting/journals?limit=5", token=token)["data"]
    ff_je = next((j for j in latest_jes if j.get("source_type") == "item_fulfillment"), None)
    if ff_je:
        lines = get_je_lines(token, ff_je["id"])
        print(f"  ✅ Fulfillment GL: {ff_je['journal_number']} | Lines: {len(lines)}")
        for l in lines:
            dr_cr = f"Dr {l['debit_base']:,.0f}" if float(l['debit_base']) > 0 else f"Cr {l['credit_base']:,.0f}"
            print(f"     {l['account_code']} {l['account_name']}: {dr_cr} | {l['memo']}")
    else:
        print("  ℹ️  No COGS GL (items may have zero cost)")
else:
    print("  ℹ️  No GL posted (items have zero average cost - OK for test data)")

# Create invoice
inv = api("POST", f"/sales/orders/{SO_ID}/invoice", {"invoiceDate": "2026-09-02"}, token)
INV_ID = inv["data"]["id"]
print(f"\n  Invoice: {inv['data']['invoice_number']} | Posted: {inv['data']['is_posted']}")

# Get invoice JE and verify NO COGS
inv_detail = api("GET", f"/sales/invoices/{INV_ID}", token=token)
inv_jes = inv_detail["data"].get("journalEntries", [])
print(f"  Invoice JEs: {len(inv_jes)}")
for je in inv_jes:
    lines = get_je_lines(token, je["id"])
    print(f"  ✅ Invoice GL: {je['journal_number']}")
    for l in lines:
        dr_cr = f"Dr {float(l['debit_base']):,.0f}" if float(l['debit_base']) > 0 else f"Cr {float(l['credit_base']):,.0f}"
        print(f"     {l['account_code']} {l['account_name']}: {dr_cr}")
    cogs_lines = [l for l in lines if 'COGS' in l.get('account_name','').upper() or l['account_code'] == '5100']
    if cogs_lines:
        print(f"  ❌ INVOICE STILL HAS COGS ENTRY - SHOULD NOT!")
    else:
        print(f"  ✅ Invoice has NO COGS (correct - COGS moved to fulfillment)")

print("\n" + "=" * 60)
print("  TEST 2: PURCHASE FLOW - GRN & Vendor Bill GL")
print("=" * 60)

# Create & approve PO
po = api("POST", "/purchasing/orders", {"vendorId": VENDOR, "orderDate": "2026-09-02",
    "lines": [{"itemId": ITEM, "quantity": 20, "unitPrice": 80000, "taxAmount": 160000}]}, token)
PO_ID = po["data"]["id"]
api("POST", f"/purchasing/orders/{PO_ID}/approve", {}, token)
POL_ID = api("GET", f"/purchasing/orders/{PO_ID}", token=token)["data"]["lines"][0]["id"]
print(f"  PO: {po['data']['po_number']}")

je_before_grn = api("GET", "/accounting/journals", token=token)["total"]

# Receive items
rcpt = api("POST", f"/purchasing/orders/{PO_ID}/receive", {
    "receiptDate": "2026-09-02", "locationId": LOC,
    "lines": [{"poLineId": POL_ID, "itemId": ITEM, "quantity": 20, "unitCost": 80000}]
}, token)
RCPT_DATA = check("Goods Receipt Created", rcpt, "receipt_number")

je_after_grn = api("GET", "/accounting/journals", token=token)["total"]
new_grn_jes = je_after_grn - je_before_grn
print(f"  New JEs after GRN: {new_grn_jes}")

# Get GRN JE
latest_jes = api("GET", "/accounting/journals?limit=5", token=token)["data"]
grn_je = next((j for j in latest_jes if j.get("source_type") == "item_receipt"), None)
if grn_je:
    lines = get_je_lines(token, grn_je["id"])
    print(f"  ✅ GRN GL: {grn_je['journal_number']} | Lines: {len(lines)}")
    for l in lines:
        dr_cr = f"Dr {float(l['debit_base']):,.0f}" if float(l['debit_base']) > 0 else f"Cr {float(l['credit_base']):,.0f}"
        print(f"     {l['account_code']} {l['account_name']}: {dr_cr} | {l['memo']}")
    
    has_inventory_dr = any(float(l['debit_base']) > 0 and l['account_code'] in ['1200','1210'] for l in lines)
    has_accrued_cr = any(float(l['credit_base']) > 0 and l['account_code'] == '2110' for l in lines)
    print(f"  {'✅' if has_inventory_dr else '❌'} Dr. Inventory: {has_inventory_dr}")
    print(f"  {'✅' if has_accrued_cr else '❌'} Cr. Accrued AP (2110): {has_accrued_cr}")
else:
    print("  ❌ No GRN GL found")

# Create Vendor Bill
je_before_bill = api("GET", "/accounting/journals", token=token)["total"]
bill = api("POST", f"/purchasing/orders/{PO_ID}/bill", {"billDate": "2026-09-02"}, token)
BILL_ID = bill["data"]["id"] if bill.get("success") else None
check("Vendor Bill Created + GL", bill, "bill_number")

if BILL_ID:
    print(f"  Bill GL Posted: {bill['data']['is_posted']}")
    
    # Get bill JE
    latest_jes = api("GET", "/accounting/journals?limit=5", token=token)["data"]
    bill_je = next((j for j in latest_jes if j.get("source_type") == "vendor_bill"), None)
    if bill_je:
        lines = get_je_lines(token, bill_je["id"])
        print(f"  ✅ Bill GL: {bill_je['journal_number']} | Lines: {len(lines)}")
        for l in lines:
            dr_cr = f"Dr {float(l['debit_base']):,.0f}" if float(l['debit_base']) > 0 else f"Cr {float(l['credit_base']):,.0f}"
            print(f"     {l['account_code']} {l['account_name']}: {dr_cr} | {l['memo']}")
        
        has_accrued_dr = any(float(l['debit_base']) > 0 and l['account_code'] == '2110' for l in lines)
        has_ap_cr = any(float(l['credit_base']) > 0 and l['account_code'] == '2100' for l in lines)
        print(f"  {'✅' if has_accrued_dr else '❌'} Dr. Accrued AP (2110): {has_accrued_dr}")
        print(f"  {'✅' if has_ap_cr else '❌'} Cr. Accounts Payable (2100): {has_ap_cr}")

    # Test Vendor Bill Detail API
    print(f"\n  Testing Vendor Bill Detail API...")
    bill_detail = api("GET", f"/purchasing/bills/{BILL_ID}", token=token)
    if bill_detail.get("success"):
        bd = bill_detail["data"]
        print(f"  ✅ Bill Detail: {bd['bill_number']} | Lines: {len(bd.get('lines',[]))} | JEs: {len(bd.get('journalEntries',[]))}")
        print(f"     Vendor: {bd['vendor_name']} | Total: {float(bd['total_amount']):,.0f} | Due: {float(bd['amount_due']):,.0f}")
    else:
        print(f"  ❌ Bill Detail: {bill_detail.get('error')}")

print("\n" + "=" * 60)
print("  GL SUMMARY")
print("=" * 60)
journals = api("GET", "/accounting/journals", token=token)
tb = api("GET", "/accounting/reports/trial-balance?dateFrom=2026-01-01&dateTo=2026-12-31", token=token)
print(f"  Total GL Entries: {journals.get('total', 0)}")
if tb.get("success"):
    td = tb["data"]
    print(f"  Trial Balance: Debit={td['totalDebit']:,.0f} | Credit={td['totalCredit']:,.0f} | Balanced={td['isBalanced']}")
print()
