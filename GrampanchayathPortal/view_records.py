"""
Gram Panchayat Transparent Complaint Portal
Database Inspection Utility for Local Verification

Run this script in your terminal to inspect all persistent records in SQLite:
    python view_records.py
"""

import sys
import sqlite3
from pathlib import Path

# Fix Windows console UTF-8 printing
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DB_PATH = Path(__file__).resolve().parent / 'data' / 'complaints.db'

def inspect_database():
    if not DB_PATH.exists():
        print(f"[!] Database file not found at: {DB_PATH}")
        print("    Please run 'python app.py' first to initialize the database.")
        return

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("=" * 80)
    print("  GRAM PANCHAYAT TRANSPARENT COMPLAINT PORTAL - SQLITE DATABASE VIEWER")
    print(f"  Database File: {DB_PATH}")
    print("=" * 80)

    # 1. Inspect Complaints Table
    cursor.execute("""
        SELECT id, public_id, category, village_name, problem_location,
               date_noticed, is_anonymous, status, photo_filename, created_at,
               SUBSTR(secret_hash, 1, 12) || '...' AS secret_hash_preview
        FROM complaints
        ORDER BY id DESC
    """)
    complaints = cursor.fetchall()

    print(f"\n[TABLE 1: PUBLIC COMPLAINTS] ({len(complaints)} total recorded)")
    print("-" * 80)
    if not complaints:
        print("  No complaints recorded yet. Submit one at http://127.0.0.1:5000/submit-complaint.html")
    else:
        for c in complaints:
            anon_tag = "🔒 Anonymous" if c['is_anonymous'] else "👤 Identified"
            photo_tag = f"📎 {c['photo_filename']}" if c['photo_filename'] else "No Photo"
            print(f"  • Ticket: {c['public_id']} | Status: [{c['status']}] | Mode: {anon_tag}")
            print(f"    Category: {c['category']} | Village/Ward: {c['village_name']}")
            print(f"    Landmark: {c['problem_location']}")
            print(f"    Recorded At: {c['created_at']} | Photo: {photo_tag}")
            print(f"    Stored Secret Hash (SHA-256): {c['secret_hash_preview']} (Original secret is NOT stored)")
            print()

    # 2. Inspect Isolated Contacts Table
    cursor.execute("""
        SELECT c.id, c.complaint_id, p.public_id, c.citizen_name, c.citizen_phone, c.citizen_email, c.created_at
        FROM complaint_contacts c
        JOIN complaints p ON c.complaint_id = p.id
        ORDER BY c.id DESC
    """)
    contacts = cursor.fetchall()

    print(f"\n[TABLE 2: ISOLATED CITIZEN CONTACTS (NON-PUBLIC)] ({len(contacts)} recorded)")
    print("-" * 80)
    print("  * Notice: Stored in an isolated table. NEVER exposed by public /api/complaints/<id> route.")
    if not contacts:
        print("  No identified complaints submitted yet.")
    else:
        for ct in contacts:
            email = ct['citizen_email'] or "Not provided"
            print(f"  • Linked Ticket: {ct['public_id']} (DB ID: {ct['complaint_id']})")
            print(f"    Name:  {ct['citizen_name']}")
            print(f"    Phone: {ct['citizen_phone']} (Used strictly for grievance officer verification)")
            print(f"    Email: {email}")
            print()

    # 3. Inspect Status History Table
    cursor.execute("""
        SELECT h.id, p.public_id, h.status, h.officer_note, h.updated_at
        FROM status_history h
        JOIN complaints p ON h.complaint_id = p.id
        ORDER BY h.id DESC
    """)
    history = cursor.fetchall()

    print(f"\n[TABLE 3: AUDIT & STATUS HISTORY TRAIL] ({len(history)} entries)")
    print("-" * 80)
    for h in history:
        print(f"  • Ticket: {h['public_id']} | Milestone: [{h['status']}] | Time: {h['updated_at']}")
        print(f"    Officer Note: {h['officer_note']}")
        print()

    conn.close()
    print("=" * 80)

if __name__ == '__main__':
    inspect_database()
