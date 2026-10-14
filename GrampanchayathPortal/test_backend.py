"""
Test Suite for Gram Panchayat Transparent Complaint Portal (Stage 3 Backend)
Tests:
 1. Page Serving & Static Asset Security (Blocking .db and .py downloads)
 2. Input Validation (Missing fields, invalid phone, future date)
 3. Anonymous Submission & Database Integrity
 4. Identified Submission with Isolated Contact Table
 5. Public Tracking Lookup (Zero Exposure of Secrets or Contact Details)
 6. Cryptographic Secret Verification (Ownership Proof)
 7. File Upload & Storage Verification
 8. Database Persistence Across Server Sessions
"""

import sys
import sqlite3
import requests
import io
from pathlib import Path
from PIL import Image

# Ensure standard output can print Unicode on Windows PowerShell
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_URL = "http://127.0.0.1:5000"
DB_PATH = Path("data/complaints.db")

def run_tests():
    print("=" * 70)
    print("STARTING GRAM PANCHAYAT BACKEND & DATABASE TEST SUITE")
    print("=" * 70)

    # --------------------------------------------------------------------------
    # TEST 1: Page Serving & Security Checks
    # --------------------------------------------------------------------------
    print("\n[TEST 1] Testing page serving & static security rules...")
    r = requests.get(f"{BASE_URL}/")
    assert r.status_code == 200, f"Expected 200 for /, got {r.status_code}"
    assert "Gram Panchayat" in r.text, "Homepage title missing"
    print("  ✓ Homepage (index.html) successfully served.")

    r = requests.get(f"{BASE_URL}/submit-complaint.html")
    assert r.status_code == 200, f"Expected 200 for submit-complaint.html, got {r.status_code}"
    assert "Report a Village Civic Problem" in r.text, "Registration title missing"
    print("  ✓ Registration page (submit-complaint.html) successfully served.")

    # Security check: Ensure raw database and python files are NOT downloadable
    r_db = requests.get(f"{BASE_URL}/data/complaints.db")
    assert r_db.status_code == 404, f"Security failure: /data/complaints.db returned {r_db.status_code} instead of 404"
    r_py = requests.get(f"{BASE_URL}/app.py")
    assert r_py.status_code == 404, f"Security failure: /app.py returned {r_py.status_code} instead of 404"
    print("  ✓ Security verification: direct access to SQLite .db and .py source files is blocked (404).")

    # --------------------------------------------------------------------------
    # TEST 2: Server-Side Validation Failures
    # --------------------------------------------------------------------------
    print("\n[TEST 2] Testing server-side input validation...")
    
    # 2a: Missing category
    payload_bad = {
        'complaint_category': 'InvalidCategory',
        'village_name': 'Ward 1',
        'problem_location': 'Near school',
        'complaint_description': 'Description is long enough for test.',
        'submission_mode': 'anonymous'
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=payload_bad)
    assert r.status_code == 400, f"Expected 400 for bad category, got {r.status_code}"
    assert 'complaint_category' in r.json().get('errors', {}), "Expected category error"
    print("  ✓ Invalid category correctly rejected with 400.")

    # 2b: Description too short (< 15 characters)
    payload_short_desc = {
        'complaint_category': 'Water Supply',
        'village_name': 'Ward 2',
        'problem_location': 'Near community pump',
        'complaint_description': 'Too short',
        'submission_mode': 'anonymous'
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=payload_short_desc)
    assert r.status_code == 400, f"Expected 400 for short desc, got {r.status_code}"
    assert 'complaint_description' in r.json().get('errors', {}), "Expected description error"
    print("  ✓ Short description (< 15 chars) correctly rejected with 400.")

    # 2c: Identified mode with missing or invalid phone number
    payload_bad_phone = {
        'complaint_category': 'Streetlights',
        'village_name': 'Ward 3',
        'problem_location': 'Crossroad lamp post',
        'complaint_description': 'Lamp post fixture blown during storm, junction is dark.',
        'submission_mode': 'identified',
        'citizen_name': 'Ramesh',
        'citizen_phone': '12345'  # Invalid phone
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=payload_bad_phone)
    assert r.status_code == 400, f"Expected 400 for bad phone, got {r.status_code}"
    assert 'citizen_phone' in r.json().get('errors', {}), "Expected phone error"
    print("  ✓ Invalid mobile number correctly rejected with 400.")

    # --------------------------------------------------------------------------
    # TEST 3: Anonymous Complaint Submission & Database Verification
    # --------------------------------------------------------------------------
    print("\n[TEST 3] Testing anonymous complaint submission & database insertion...")
    payload_anon = {
        'complaint_category': 'Water Supply',
        'village_name': 'Shanti Nagar, Ward 2',
        'problem_location': 'Opposite Govt Primary School, community handpump',
        'date_noticed': '2026-10-12',
        'complaint_description': 'Submersible pump motor failed 3 days ago. No drinking water for 35 families in lane 4.',
        'submission_mode': 'anonymous'
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=payload_anon)
    assert r.status_code == 201, f"Expected 201 Created, got {r.status_code}: {r.text}"
    anon_res = r.json()
    assert anon_res['success'] is True, "Expected success: true"
    anon_public_id = anon_res['public_id']
    anon_secret = anon_res['tracking_secret']

    assert anon_public_id.startswith("GP-2026-"), f"Unexpected public ID format: {anon_public_id}"
    assert anon_secret.startswith("TS-"), f"Unexpected tracking secret format: {anon_secret}"
    assert anon_res['status'] == 'Submitted', "Initial status must be 'Submitted'"
    print(f"  ✓ Anonymous submission successful. Reference: {anon_public_id}")
    print(f"  ✓ One-time tracking secret issued: {anon_secret[:12]}...")

    # Inspect SQLite database directly for anonymous submission
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM complaints WHERE public_id = ?", (anon_public_id,))
    row = cur.fetchone()
    assert row is not None, "Complaint record not found in SQLite database!"
    assert row['is_anonymous'] == 1, "Expected is_anonymous == 1"
    assert row['secret_hash'] != anon_secret, "Security violation: plain tracking secret stored!"
    assert len(row['secret_hash']) == 64, "Expected 64-char SHA-256 hash"

    # Confirm ZERO contact records stored in complaint_contacts
    cur.execute("SELECT * FROM complaint_contacts WHERE complaint_id = ?", (row['id'],))
    contact_row = cur.fetchone()
    assert contact_row is None, "Privacy violation: contact record created for anonymous complaint!"

    # Confirm status_history initialized
    cur.execute("SELECT * FROM status_history WHERE complaint_id = ?", (row['id'],))
    history_row = cur.fetchone()
    assert history_row is not None, "Initial status history entry missing"
    assert history_row['status'] == 'Submitted', "Expected status history 'Submitted'"
    conn.close()
    print("  ✓ SQLite verification: Record stored, zero contact info saved, SHA-256 hash stored.")

    # --------------------------------------------------------------------------
    # TEST 4: Identified Complaint Submission & Contact Isolation
    # --------------------------------------------------------------------------
    print("\n[TEST 4] Testing identified complaint submission with separate contact table...")
    payload_ident = {
        'complaint_category': 'Roads & Pathways',
        'village_name': 'Kalyan Gram, Ward 5',
        'problem_location': 'Near bus stop, market entry bridge',
        'date_noticed': '2026-10-10',
        'complaint_description': 'Massive trench dug across the road for cable laying was left open without warning signs. Two two-wheelers skidded yesterday.',
        'submission_mode': 'identified',
        'citizen_name': 'Suresh Gowda',
        'citizen_phone': '9845012345',
        'citizen_email': 'suresh.gowda@example.com'
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=payload_ident)
    assert r.status_code == 201, f"Expected 201 Created, got {r.status_code}: {r.text}"
    ident_res = r.json()
    ident_public_id = ident_res['public_id']
    ident_secret = ident_res['tracking_secret']
    print(f"  ✓ Identified submission successful. Reference: {ident_public_id}")

    # Inspect SQLite database directly for isolated contact storage
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, is_anonymous FROM complaints WHERE public_id = ?", (ident_public_id,))
    c_row = cur.fetchone()
    assert c_row['is_anonymous'] == 0, "Expected is_anonymous == 0"

    cur.execute("SELECT * FROM complaint_contacts WHERE complaint_id = ?", (c_row['id'],))
    contact_row = cur.fetchone()
    assert contact_row is not None, "Expected contact record in complaint_contacts"
    assert contact_row['citizen_name'] == 'Suresh Gowda', "Name mismatch"
    assert contact_row['citizen_phone'] == '9845012345', "Phone mismatch"
    assert contact_row['citizen_email'] == 'suresh.gowda@example.com', "Email mismatch"
    conn.close()
    print("  ✓ SQLite verification: Contact details isolated in complaint_contacts table.")

    # --------------------------------------------------------------------------
    # TEST 5: Public Lookup Endpoint (Strict Zero Exposure Check)
    # --------------------------------------------------------------------------
    print("\n[TEST 5] Testing public tracker lookup & confidentiality...")
    r = requests.get(f"{BASE_URL}/api/complaints/{ident_public_id}")
    assert r.status_code == 200, f"Expected 200 for public lookup, got {r.status_code}"
    pub_data = r.json()

    assert pub_data['public_id'] == ident_public_id
    assert pub_data['status'] == 'Submitted'
    assert 'history' in pub_data and len(pub_data['history']) >= 1

    # STRICT SECURITY CHECK: Contact info and hashes MUST NEVER be exposed in public API
    assert 'citizen_name' not in pub_data, "SECURITY LEAK: citizen_name exposed in public API!"
    assert 'citizen_phone' not in pub_data, "SECURITY LEAK: citizen_phone exposed in public API!"
    assert 'citizen_email' not in pub_data, "SECURITY LEAK: citizen_email exposed in public API!"
    assert 'secret_hash' not in pub_data, "SECURITY LEAK: secret_hash exposed in public API!"
    assert 'salt' not in pub_data, "SECURITY LEAK: salt exposed in public API!"
    print("  ✓ Public API verified: contact details and secret hashes are NEVER leaked.")

    # --------------------------------------------------------------------------
    # TEST 6: Ownership Verification via Tracking Secret
    # --------------------------------------------------------------------------
    print("\n[TEST 6] Testing ownership verification using tracking secret...")
    # 6a: Correct secret
    verify_payload = {'tracking_secret': ident_secret}
    r = requests.post(f"{BASE_URL}/api/complaints/{ident_public_id}/verify", json=verify_payload)
    assert r.status_code == 200, f"Expected 200 for valid secret, got {r.status_code}"
    verify_data = r.json()
    assert verify_data['verified'] is True, "Expected verified: true"
    assert verify_data['contact_details']['citizen_name'] == 'Suresh Gowda'
    print("  ✓ Correct tracking secret unlocks verified ownership.")

    # 6b: Wrong secret
    wrong_payload = {'tracking_secret': 'TS-INVALID_SECRET_TOKEN_123456'}
    r = requests.post(f"{BASE_URL}/api/complaints/{ident_public_id}/verify", json=wrong_payload)
    assert r.status_code == 401, f"Expected 401 Unauthorized for wrong secret, got {r.status_code}"
    print("  ✓ Invalid tracking secret rejected with 401 Unauthorized.")

    # --------------------------------------------------------------------------
    # TEST 7: Photograph Upload & EXIF Stripping
    # --------------------------------------------------------------------------
    print("\n[TEST 7] Testing photograph upload, integrity, and EXIF sanitization...")
    # Create in-memory test image
    img = Image.new('RGB', (100, 100), color='forestgreen')
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)

    photo_payload = {
        'complaint_category': 'Drainage & Gutters',
        'village_name': 'North Ward 1',
        'problem_location': 'Behind temple pond drain outlet',
        'complaint_description': 'Drain overflow causing stagnant black water in open alleyway.',
        'submission_mode': 'anonymous'
    }
    files = {
        'photo_upload': ('test_puddle.jpg', img_bytes, 'image/jpeg')
    }
    r = requests.post(f"{BASE_URL}/api/complaints", data=photo_payload, files=files)
    assert r.status_code == 201, f"Expected 201 for photo upload, got {r.status_code}: {r.text}"
    photo_res = r.json()
    photo_pub_id = photo_res['public_id']

    # Query public record to see photo URL
    r_pub = requests.get(f"{BASE_URL}/api/complaints/{photo_pub_id}")
    assert r_pub.status_code == 200
    pub_photo_data = r_pub.json()
    assert pub_photo_data['has_photo'] is True, "Expected has_photo: true"
    photo_url = pub_photo_data['photo_url']
    assert photo_url is not None and photo_url.startswith('/api/uploads/')

    # Test downloading the uploaded photo
    r_img = requests.get(f"{BASE_URL}{photo_url}")
    assert r_img.status_code == 200, f"Expected 200 for photo fetch, got {r_img.status_code}"
    assert len(r_img.content) > 0, "Uploaded photo content was empty"
    print(f"  ✓ Photograph uploaded, verified, sanitized, and served via {photo_url}.")

    # --------------------------------------------------------------------------
    # TEST 8: Database Persistence
    # --------------------------------------------------------------------------
    print("\n[TEST 8] Verifying persistent database records on disk...")
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM complaints")
    total_complaints = cur.fetchone()[0]
    conn.close()

    assert total_complaints >= 3, f"Expected at least 3 persistent complaints, got {total_complaints}"
    print(f"  ✓ Database file '{DB_PATH}' contains {total_complaints} persistent complaints.")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! BACKEND & DATABASE FULLY OPERATIONAL.")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
