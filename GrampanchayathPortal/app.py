"""
Gram Panchayat Transparent Complaint Portal
Backend & Database Server (Flask + SQLite)

Stages 1-6 Implementation:
 - Persistent SQLite database with automatic migrations and index creation
 - Separation of private contact information from public complaint data
 - Cryptographically generated public reference IDs & tracking secrets
 - SHA-256 salted hash storage for tracking secrets
 - Secure file uploads with Pillow integrity validation and EXIF metadata stripping
 - Comprehensive complaint lifecycle (Submitted, Under Review, Assigned, In Progress, Resolved, Closed, Reopened)
 - Protected Official / Admin Dashboard with role-based authentication
 - Real-time Database Transparency Statistics with privacy thresholds
 - SLA tracking & Overdue calculation
 - Automated Duplicate Complaint Detection
 - Citizen Reopening capability (via tracking secret within 7 days)
"""

import os
import re
import secrets
import hashlib
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory, abort, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image
import sqlite3

# --------------------------------------------------------------------------
# CONFIGURATION
# --------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
DB_PATH = DATA_DIR / 'complaints.db'
UPLOAD_DIR = DATA_DIR / 'uploads'

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=None)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5 MB upload limit
app.config['SECRET_KEY'] = os.environ.get('PORTAL_SECRET_KEY', 'gp_portal_secret_key_2026_secure')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}

VALID_CATEGORIES = {
    'Roads & Pathways',
    'Water Supply',
    'Streetlights',
    'Drainage & Gutters',
    'Waste Management',
    'Public Sanitation',
    'Other Village Issue'
}

VALID_STATUSES = [
    'Submitted',
    'Under Review',
    'Assigned',
    'In Progress',
    'Resolved',
    'Closed',
    'Reopened'
]

VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

# Configurable Resolution Target Days (SLA)
CATEGORY_SLA_DAYS = {
    'Water Supply': 3,
    'Streetlights': 3,
    'Drainage & Gutters': 5,
    'Waste Management': 4,
    'Public Sanitation': 4,
    'Roads & Pathways': 10,
    'Other Village Issue': 7
}

# --------------------------------------------------------------------------
# DATABASE CONNECTION & SCHEMA INITIALIZATION
# --------------------------------------------------------------------------
def get_db_connection():
    """Create a thread-safe SQLite connection with foreign keys enabled."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    """
    Initialize SQLite database schema and perform non-destructive migrations.
    Creates complaints, complaint_contacts, status_history, and officials tables.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Public Complaints Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT UNIQUE NOT NULL,
        secret_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        category TEXT NOT NULL,
        village_name TEXT NOT NULL,
        problem_location TEXT NOT NULL,
        date_noticed TEXT,
        description TEXT NOT NULL,
        photo_filename TEXT,
        is_anonymous INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'Submitted',
        priority TEXT NOT NULL DEFAULT 'Medium',
        assigned_to TEXT,
        target_resolution_date TEXT,
        verified_resolved INTEGER NOT NULL DEFAULT 0,
        reopened_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """)

    # Non-destructive migrations for existing databases
    cursor.execute("PRAGMA table_info(complaints);")
    existing_cols = {col['name'] for col in cursor.fetchall()}
    
    if 'priority' not in existing_cols:
        cursor.execute("ALTER TABLE complaints ADD COLUMN priority TEXT NOT NULL DEFAULT 'Medium';")
    if 'assigned_to' not in existing_cols:
        cursor.execute("ALTER TABLE complaints ADD COLUMN assigned_to TEXT;")
    if 'target_resolution_date' not in existing_cols:
        cursor.execute("ALTER TABLE complaints ADD COLUMN target_resolution_date TEXT;")
    if 'verified_resolved' not in existing_cols:
        cursor.execute("ALTER TABLE complaints ADD COLUMN verified_resolved INTEGER NOT NULL DEFAULT 0;")
    if 'reopened_count' not in existing_cols:
        cursor.execute("ALTER TABLE complaints ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;")

    # 2. Isolated Citizen Contact Details
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS complaint_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL UNIQUE,
        citizen_name TEXT NOT NULL,
        citizen_phone TEXT NOT NULL,
        citizen_email TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );
    """)

    # 3. Status History and Milestone Audit Trail
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        officer_note TEXT,
        resolution_photo TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
    );
    """)

    cursor.execute("PRAGMA table_info(status_history);")
    history_cols = {col['name'] for col in cursor.fetchall()}
    if 'resolution_photo' not in history_cols:
        cursor.execute("ALTER TABLE status_history ADD COLUMN resolution_photo TEXT;")

    # 4. Authorized Officials / Staff Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS officials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        ward_assigned TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_complaints_public_id ON complaints(public_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_complaints_village ON complaints(village_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_status_history_complaint_id ON status_history(complaint_id);")

    # Seed Default Official Accounts if table is empty
    cursor.execute("SELECT COUNT(*) FROM officials;")
    if cursor.fetchone()[0] == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        default_officials = [
            (
                'admin',
                generate_password_hash('Admin@GramPanchayat2026'),
                'Gram Panchayat Secretary',
                'Panchayat Secretary',
                'All Wards',
                now_iso
            ),
            (
                'ward_officer',
                generate_password_hash('Officer@GP2026'),
                'Smt. Sunita Rao',
                'Ward Grievance Officer',
                'Ward 2 - Market & School Road',
                now_iso
            ),
            (
                'field_engineer',
                generate_password_hash('Engineer@GP2026'),
                'Sri. H. Manjunath',
                'Junior Engineer (Public Works)',
                'All Wards',
                now_iso
            )
        ]
        cursor.executemany("""
            INSERT INTO officials (username, password_hash, full_name, role, ward_assigned, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, default_officials)

    conn.commit()
    conn.close()

# --------------------------------------------------------------------------
# AUTHENTICATION & ACCESS CONTROL
# --------------------------------------------------------------------------
def admin_required(f):
    """Decorator to protect official admin API endpoints."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'official_id' not in session:
            return jsonify({
                'success': False,
                'message': 'Authentication required. Please log in as an authorized Panchayat official.'
            }), 401
        return f(*args, **kwargs)
    return decorated_function

# --------------------------------------------------------------------------
# HELPER UTILITIES: TOKENS, SECURITY & OVERDUE
# --------------------------------------------------------------------------
def generate_public_id(cursor):
    """Generate an unambiguous, unpredictable public reference identifier (e.g. GP-2026-X8K9M2)."""
    charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    year = datetime.now(timezone.utc).year
    while True:
        suffix = "".join(secrets.choice(charset) for _ in range(6))
        candidate = f"GP-{year}-{suffix}"
        cursor.execute("SELECT 1 FROM complaints WHERE public_id = ?", (candidate,))
        if not cursor.fetchone():
            return candidate

def generate_tracking_secret():
    """Generate a separate high-entropy tracking secret token for ownership verification."""
    return f"TS-{secrets.token_urlsafe(24)}"

def hash_secret(secret_token, salt_hex):
    """Compute salted SHA-256 hash. Raw secret is never stored on disk."""
    payload = f"{salt_hex}:{secret_token}".encode('utf-8')
    return hashlib.sha256(payload).hexdigest()

def calculate_target_date(category, priority, created_dt):
    """Calculate SLA target resolution date based on category and urgency priority."""
    base_days = CATEGORY_SLA_DAYS.get(category, 7)
    if priority == 'Urgent':
        sla_days = max(1, base_days // 2)
    elif priority == 'High':
        sla_days = max(2, base_days - 1)
    elif priority == 'Low':
        sla_days = base_days + 3
    else:
        sla_days = base_days
    
    target_dt = created_dt + timedelta(days=sla_days)
    return target_dt.isoformat()

def is_complaint_overdue(status, target_date_str):
    """Check if an open complaint has exceeded its target resolution deadline."""
    if status in ('Resolved', 'Closed'):
        return False
    if not target_date_str:
        return False
    try:
        target_dt = datetime.fromisoformat(target_date_str)
        now_dt = datetime.now(timezone.utc)
        return now_dt > target_dt
    except Exception:
        return False

def sanitize_and_save_image(file_storage):
    """Validate image with Pillow, strip EXIF metadata, and save with unpredictable UUID."""
    if not file_storage or not file_storage.filename:
        return None, None

    filename = secure_filename(file_storage.filename)
    if '.' not in filename:
        return None, "File must have an image extension."

    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return None, f"Unsupported file type. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"

    try:
        img = Image.open(file_storage.stream)
        img.verify()

        file_storage.stream.seek(0)
        img = Image.open(file_storage.stream)

        unique_name = f"{secrets.token_hex(16)}.{ext if ext != 'jpeg' else 'jpg'}"
        dest_path = UPLOAD_DIR / unique_name

        if img.mode in ('RGBA', 'P') and ext in ('jpg', 'jpeg'):
            img = img.convert('RGB')
        img.save(str(dest_path), quality=88, optimize=True)

        return unique_name, None
    except Exception as e:
        return None, f"Invalid or corrupted image file: {str(e)}"

def detect_potential_duplicates(cursor, complaint_id, category, village_name, description):
    """
    Suggest potential duplicate complaints filed within the last 30 days
    in the same ward/category based on keyword similarity.
    """
    cursor.execute("""
        SELECT id, public_id, problem_location, description, status, created_at
        FROM complaints
        WHERE category = ? AND village_name = ? AND id != ?
          AND created_at >= datetime('now', '-30 days')
        ORDER BY id DESC
        LIMIT 25
    """, (category, village_name, complaint_id or 0))
    candidates = cursor.fetchall()

    stopwords = {
        'the', 'is', 'in', 'at', 'and', 'to', 'for', 'a', 'of', 'on', 'with',
        'near', 'by', 'road', 'village', 'ward', 'water', 'pipe', 'leak', 'broken'
    }

    def tokenize(text):
        words = re.findall(r'\b[a-zA-Z]{3,}\b', text.lower())
        return set(w for w in words if w not in stopwords)

    input_tokens = tokenize(description)
    duplicates = []

    for c in candidates:
        candidate_tokens = tokenize(c['description'])
        if not input_tokens or not candidate_tokens:
            continue
        intersection = input_tokens.intersection(candidate_tokens)
        union = input_tokens.union(candidate_tokens)
        similarity = (len(intersection) / len(union)) * 100 if union else 0

        if similarity >= 25 or len(intersection) >= 3:
            duplicates.append({
                'public_id': c['public_id'],
                'location': c['problem_location'],
                'status': c['status'],
                'similarity_pct': round(similarity, 1),
                'snippet': (c['description'][:110] + '...') if len(c['description']) > 110 else c['description']
            })

    return duplicates

# --------------------------------------------------------------------------
# CITIZEN COMPLAINT SUBMISSION & TRACKING ENDPOINTS
# --------------------------------------------------------------------------
@app.route('/api/complaints', methods=['POST'])
def submit_complaint():
    """Public endpoint to register anonymous or identified complaints."""
    data = request.form

    category = data.get('complaint_category', '').strip()
    village_name = data.get('village_name', '').strip()
    problem_location = data.get('problem_location', '').strip()
    date_noticed = data.get('date_noticed', '').strip()
    description = data.get('complaint_description', '').strip()
    submission_mode = data.get('submission_mode', 'anonymous').strip().lower()

    errors = {}

    if not category or category not in VALID_CATEGORIES:
        errors['complaint_category'] = f"Valid category required. Choose from: {', '.join(sorted(VALID_CATEGORIES))}"

    if not village_name or len(village_name) < 2 or len(village_name) > 100:
        errors['village_name'] = "Village name or ward must be between 2 and 100 characters."

    if not problem_location or len(problem_location) < 5 or len(problem_location) > 200:
        errors['problem_location'] = "Specific location & landmarks must be between 5 and 200 characters."

    if not description or len(description) < 15 or len(description) > 2000:
        errors['complaint_description'] = "Description must be between 15 and 2000 characters."

    if date_noticed:
        try:
            noticed_d = date.fromisoformat(date_noticed)
            if noticed_d > date.today():
                errors['date_noticed'] = "Date noticed cannot be in the future."
        except ValueError:
            errors['date_noticed'] = "Invalid date format. Expected YYYY-MM-DD."

    is_anonymous = (submission_mode != 'identified')
    citizen_name = None
    citizen_phone = None
    citizen_email = None

    if not is_anonymous:
        citizen_name = data.get('citizen_name', '').strip()
        citizen_phone = data.get('citizen_phone', '').strip()
        citizen_email = data.get('citizen_email', '').strip()

        if not citizen_name or len(citizen_name) < 2 or len(citizen_name) > 100:
            errors['citizen_name'] = "Full name is required for identified submissions (2-100 characters)."

        phone_regex = r'^[6-9]\d{9}$'
        if not citizen_phone or not re.match(phone_regex, citizen_phone):
            errors['citizen_phone'] = "Valid 10-digit mobile number required (starting with 6-9)."

        if citizen_email:
            email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
            if not re.match(email_regex, citizen_email) or len(citizen_email) > 120:
                errors['citizen_email'] = "Invalid email format."

    photo_filename = None
    if 'photo_upload' in request.files:
        file = request.files['photo_upload']
        if file and file.filename:
            saved_name, upload_err = sanitize_and_save_image(file)
            if upload_err:
                errors['photo_upload'] = upload_err
            else:
                photo_filename = saved_name

    if errors:
        return jsonify({
            'success': False,
            'message': 'Validation failed. Please correct the highlighted errors.',
            'errors': errors
        }), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        public_id = generate_public_id(cursor)
        tracking_secret = generate_tracking_secret()
        salt = secrets.token_hex(16)
        secret_hash = hash_secret(tracking_secret, salt)

        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()

        # Priority rule: Water & Lighting default to High, others to Medium
        default_priority = 'High' if category in ('Water Supply', 'Streetlights') else 'Medium'
        target_resolution_date = calculate_target_date(category, default_priority, now_dt)

        cursor.execute("""
            INSERT INTO complaints (
                public_id, secret_hash, salt, category, village_name,
                problem_location, date_noticed, description, photo_filename,
                is_anonymous, status, priority, target_resolution_date,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?)
        """, (
            public_id, secret_hash, salt, category, village_name,
            problem_location, date_noticed if date_noticed else None,
            description, photo_filename, 1 if is_anonymous else 0,
            default_priority, target_resolution_date, now_iso
        ))

        complaint_db_id = cursor.lastrowid

        if not is_anonymous:
            cursor.execute("""
                INSERT INTO complaint_contacts (
                    complaint_id, citizen_name, citizen_phone, citizen_email, created_at
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                complaint_db_id, citizen_name, citizen_phone,
                citizen_email if citizen_email else None, now_iso
            ))

        cursor.execute("""
            INSERT INTO status_history (
                complaint_id, status, officer_note, updated_at
            ) VALUES (?, 'Submitted', 'Complaint officially registered in Gram Panchayat digital ledger.', ?)
        """, (complaint_db_id, now_iso))

        conn.commit()

        return jsonify({
            'success': True,
            'message': 'Complaint successfully recorded in the persistent Gram Panchayat database.',
            'public_id': public_id,
            'tracking_secret': tracking_secret,
            'is_anonymous': is_anonymous,
            'category': category,
            'village_name': village_name,
            'status': 'Submitted',
            'priority': default_priority,
            'target_resolution_date': target_resolution_date,
            'created_at': now_iso,
            'privacy_notice': (
                "Save your Tracking Secret immediately. It is your only private key to prove ownership "
                "or access private updates. The server stores only a one-way hash and cannot restore it."
            )
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({
            'success': False,
            'message': f"Internal database error: {str(e)}"
        }), 500
    finally:
        conn.close()

@app.route('/api/complaints/<public_id>', methods=['GET'])
def get_complaint_public(public_id):
    """Public tracking lookup. Strictly non-sensitive information and milestone timeline."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, public_id, category, village_name, problem_location,
               date_noticed, description, photo_filename, is_anonymous,
               status, priority, target_resolution_date, verified_resolved,
               reopened_count, created_at
        FROM complaints
        WHERE public_id = ?
    """, (public_id.strip().upper(),))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({
            'success': False,
            'message': f"No complaint found matching reference ID '{public_id}'."
        }), 404

    complaint_id = row['id']

    cursor.execute("""
        SELECT status, officer_note, resolution_photo, updated_at
        FROM status_history
        WHERE complaint_id = ?
        ORDER BY id ASC
    """, (complaint_id,))
    history_rows = cursor.fetchall()
    conn.close()

    history = [
        {
            'status': h['status'],
            'officer_note': h['officer_note'],
            'resolution_photo_url': f"/api/uploads/{h['resolution_photo']}" if h['resolution_photo'] else None,
            'updated_at': h['updated_at']
        }
        for h in history_rows
    ]

    is_overdue = is_complaint_overdue(row['status'], row['target_resolution_date'])

    return jsonify({
        'success': True,
        'public_id': row['public_id'],
        'category': row['category'],
        'village_name': row['village_name'],
        'problem_location': row['problem_location'],
        'date_noticed': row['date_noticed'],
        'description': row['description'],
        'has_photo': bool(row['photo_filename']),
        'photo_url': f"/api/uploads/{row['photo_filename']}" if row['photo_filename'] else None,
        'is_anonymous': bool(row['is_anonymous']),
        'status': row['status'],
        'priority': row['priority'],
        'is_overdue': is_overdue,
        'target_resolution_date': row['target_resolution_date'],
        'verified_resolved': bool(row['verified_resolved']),
        'reopened_count': row['reopened_count'],
        'created_at': row['created_at'],
        'history': history
    }), 200

@app.route('/api/complaints/<public_id>/verify', methods=['POST'])
def verify_complaint_ownership(public_id):
    """Verify ownership using tracking secret via constant-time hash comparison."""
    data = request.get_json(silent=True) or request.form
    tracking_secret = data.get('tracking_secret', '').strip()

    if not tracking_secret:
        return jsonify({'success': False, 'message': 'Tracking secret required.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, public_id, secret_hash, salt, is_anonymous, status, created_at
        FROM complaints
        WHERE public_id = ?
    """, (public_id.strip().upper(),))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    computed_hash = hash_secret(tracking_secret, row['salt'])
    if not secrets.compare_digest(computed_hash, row['secret_hash']):
        conn.close()
        return jsonify({'success': False, 'message': 'Invalid tracking secret.'}), 401

    contact_info = None
    if not row['is_anonymous']:
        cursor.execute("""
            SELECT citizen_name, citizen_phone, citizen_email
            FROM complaint_contacts
            WHERE complaint_id = ?
        """, (row['id'],))
        c_row = cursor.fetchone()
        if c_row:
            contact_info = {
                'citizen_name': c_row['citizen_name'],
                'citizen_phone': c_row['citizen_phone'],
                'citizen_email': c_row['citizen_email']
            }

    conn.close()

    return jsonify({
        'success': True,
        'verified': True,
        'public_id': row['public_id'],
        'status': row['status'],
        'is_anonymous': bool(row['is_anonymous']),
        'contact_details': contact_info
    }), 200

@app.route('/api/complaints/<public_id>/reopen', methods=['POST'])
def reopen_complaint(public_id):
    """
    Allow citizen with valid tracking secret to reopen a complaint
    within 7 days if the problem has not been properly resolved.
    """
    data = request.get_json(silent=True) or request.form
    tracking_secret = data.get('tracking_secret', '').strip()
    reason = data.get('reason', '').strip()

    if not tracking_secret:
        return jsonify({'success': False, 'message': 'Tracking secret required.'}), 400
    if not reason or len(reason) < 10:
        return jsonify({'success': False, 'message': 'Please provide an explanatory reason for reopening (min 10 characters).'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, public_id, secret_hash, salt, status, reopened_count
        FROM complaints
        WHERE public_id = ?
    """, (public_id.strip().upper(),))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    computed_hash = hash_secret(tracking_secret, row['salt'])
    if not secrets.compare_digest(computed_hash, row['secret_hash']):
        conn.close()
        return jsonify({'success': False, 'message': 'Invalid tracking secret token.'}), 401

    if row['status'] not in ('Resolved', 'Closed'):
        conn.close()
        return jsonify({'success': False, 'message': f"Cannot reopen complaint currently in '{row['status']}' status."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    new_reopen_count = row['reopened_count'] + 1

    cursor.execute("""
        UPDATE complaints
        SET status = 'Reopened', reopened_count = ?, verified_resolved = 0
        WHERE id = ?
    """, (new_reopen_count, row['id']))

    cursor.execute("""
        INSERT INTO status_history (complaint_id, status, officer_note, updated_at)
        VALUES (?, 'Reopened', ?, ?)
    """, (row['id'], f"Reopened by citizen: {reason}", now_iso))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': 'Complaint has been reopened and queued for Panchayat supervisor review.',
        'public_id': public_id,
        'status': 'Reopened',
        'reopened_count': new_reopen_count
    }), 200

# --------------------------------------------------------------------------
# ADMIN & OFFICIAL DASHBOARD ENDPOINTS
# --------------------------------------------------------------------------
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """Authenticate authorized Gram Panchayat officials."""
    data = request.get_json(silent=True) or request.form
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password required.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM officials WHERE username = ?", (username,))
    official = cursor.fetchone()
    conn.close()

    if not official or not check_password_hash(official['password_hash'], password):
        return jsonify({'success': False, 'message': 'Invalid official username or password.'}), 401

    session['official_id'] = official['id']
    session['official_username'] = official['username']
    session['official_name'] = official['full_name']
    session['official_role'] = official['role']
    session['official_ward'] = official['ward_assigned']

    return jsonify({
        'success': True,
        'message': f"Welcome, {official['full_name']} ({official['role']})",
        'official': {
            'username': official['username'],
            'full_name': official['full_name'],
            'role': official['role'],
            'ward': official['ward_assigned']
        }
    }), 200

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    """End official session."""
    session.clear()
    return jsonify({'success': True, 'message': 'Successfully logged out.'}), 200

@app.route('/api/admin/me', methods=['GET'])
def admin_me():
    """Get active official profile if authenticated."""
    if 'official_id' not in session:
        return jsonify({'authenticated': False}), 200
    return jsonify({
        'authenticated': True,
        'official': {
            'username': session.get('official_username'),
            'full_name': session.get('official_name'),
            'role': session.get('official_role'),
            'ward': session.get('official_ward')
        }
    }), 200

@app.route('/api/admin/complaints', methods=['GET'])
@admin_required
def admin_list_complaints():
    """List complaints with filtering by category, ward, status, priority, and overdue flag."""
    status_filter = request.args.get('status', '').strip()
    category_filter = request.args.get('category', '').strip()
    ward_filter = request.args.get('ward', '').strip()
    priority_filter = request.args.get('priority', '').strip()
    search_q = request.args.get('q', '').strip()
    overdue_only = request.args.get('overdue', 'false').lower() == 'true'

    query = """
        SELECT c.id, c.public_id, c.category, c.village_name, c.problem_location,
               c.date_noticed, c.is_anonymous, c.status, c.priority, c.assigned_to,
               c.target_resolution_date, c.verified_resolved, c.reopened_count,
               c.created_at, c.photo_filename,
               co.citizen_name, co.citizen_phone
        FROM complaints c
        LEFT JOIN complaint_contacts co ON c.id = co.complaint_id
        WHERE 1=1
    """
    params = []

    if status_filter:
        query += " AND c.status = ?"
        params.append(status_filter)
    if category_filter:
        query += " AND c.category = ?"
        params.append(category_filter)
    if ward_filter:
        query += " AND c.village_name LIKE ?"
        params.append(f"%{ward_filter}%")
    if priority_filter:
        query += " AND c.priority = ?"
        params.append(priority_filter)
    if search_q:
        query += " AND (c.public_id LIKE ? OR c.description LIKE ? OR c.problem_location LIKE ?)"
        term = f"%{search_q}%"
        params.extend([term, term, term])

    query += " ORDER BY c.id DESC LIMIT 200"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()

    complaints_list = []
    for r in rows:
        overdue = is_complaint_overdue(r['status'], r['target_resolution_date'])
        if overdue_only and not overdue:
            continue

        complaints_list.append({
            'id': r['id'],
            'public_id': r['public_id'],
            'category': r['category'],
            'village_name': r['village_name'],
            'problem_location': r['problem_location'],
            'status': r['status'],
            'priority': r['priority'],
            'assigned_to': r['assigned_to'] or 'Unassigned',
            'is_anonymous': bool(r['is_anonymous']),
            'is_overdue': overdue,
            'target_resolution_date': r['target_resolution_date'],
            'verified_resolved': bool(r['verified_resolved']),
            'reopened_count': r['reopened_count'],
            'has_photo': bool(r['photo_filename']),
            'created_at': r['created_at'],
            'citizen_name': r['citizen_name'] if not r['is_anonymous'] else None,
            'citizen_phone': r['citizen_phone'] if not r['is_anonymous'] else None
        })

    conn.close()
    return jsonify({
        'success': True,
        'count': len(complaints_list),
        'complaints': complaints_list
    }), 200

@app.route('/api/admin/complaints/<int:complaint_id>', methods=['GET'])
@admin_required
def admin_get_complaint(complaint_id):
    """Retrieve full details for authorized staff, including isolated contact info & duplicates."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT c.*, co.citizen_name, co.citizen_phone, co.citizen_email
        FROM complaints c
        LEFT JOIN complaint_contacts co ON c.id = co.complaint_id
        WHERE c.id = ?
    """, (complaint_id,))
    r = cursor.fetchone()

    if not r:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    cursor.execute("""
        SELECT status, officer_note, resolution_photo, updated_at
        FROM status_history
        WHERE complaint_id = ?
        ORDER BY id ASC
    """, (complaint_id,))
    history_rows = cursor.fetchall()

    duplicates = detect_potential_duplicates(
        cursor, complaint_id, r['category'], r['village_name'], r['description']
    )
    conn.close()

    history = [
        {
            'status': h['status'],
            'officer_note': h['officer_note'],
            'resolution_photo_url': f"/api/uploads/{h['resolution_photo']}" if h['resolution_photo'] else None,
            'updated_at': h['updated_at']
        }
        for h in history_rows
    ]

    return jsonify({
        'success': True,
        'complaint': {
            'id': r['id'],
            'public_id': r['public_id'],
            'category': r['category'],
            'village_name': r['village_name'],
            'problem_location': r['problem_location'],
            'date_noticed': r['date_noticed'],
            'description': r['description'],
            'photo_url': f"/api/uploads/{r['photo_filename']}" if r['photo_filename'] else None,
            'is_anonymous': bool(r['is_anonymous']),
            'status': r['status'],
            'priority': r['priority'],
            'assigned_to': r['assigned_to'] or 'Unassigned',
            'is_overdue': is_complaint_overdue(r['status'], r['target_resolution_date']),
            'target_resolution_date': r['target_resolution_date'],
            'verified_resolved': bool(r['verified_resolved']),
            'reopened_count': r['reopened_count'],
            'created_at': r['created_at'],
            'contact': {
                'name': r['citizen_name'],
                'phone': r['citizen_phone'],
                'email': r['citizen_email']
            } if not r['is_anonymous'] else None,
            'history': history,
            'suggested_duplicates': duplicates
        }
    }), 200

@app.route('/api/admin/complaints/<int:complaint_id>/update-status', methods=['POST'])
@admin_required
def admin_update_status(complaint_id):
    """Update complaint status with remarks, resolution evidence upload, and audit logging."""
    new_status = request.form.get('status', '').strip()
    officer_remarks = request.form.get('officer_remarks', '').strip()
    verified_resolved = request.form.get('verified_resolved', 'false').lower() == 'true'

    if new_status not in VALID_STATUSES:
        return jsonify({'success': False, 'message': f"Invalid status. Choose from: {', '.join(VALID_STATUSES)}"}), 400
    if not officer_remarks or len(officer_remarks) < 5:
        return jsonify({'success': False, 'message': 'Official remark is required (minimum 5 characters).'}), 400

    resolution_photo_name = None
    if 'resolution_photo' in request.files:
        r_file = request.files['resolution_photo']
        if r_file and r_file.filename:
            saved_name, err = sanitize_and_save_image(r_file)
            if err:
                return jsonify({'success': False, 'message': err}), 400
            resolution_photo_name = saved_name

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status, verified_resolved FROM complaints WHERE id = ?", (complaint_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    now_iso = datetime.now(timezone.utc).isoformat()
    staff_name = session.get('official_name', 'Authorized Official')
    full_note = f"[{new_status}] Updated by {staff_name}: {officer_remarks}"

    verified_flag = 1 if (verified_resolved or new_status == 'Closed') else existing['verified_resolved']

    cursor.execute("""
        UPDATE complaints
        SET status = ?, verified_resolved = ?
        WHERE id = ?
    """, (new_status, verified_flag, complaint_id))

    cursor.execute("""
        INSERT INTO status_history (complaint_id, status, officer_note, resolution_photo, updated_at)
        VALUES (?, ?, ?, ?, ?)
    """, (complaint_id, new_status, full_note, resolution_photo_name, now_iso))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': f"Complaint status successfully updated to '{new_status}'.",
        'new_status': new_status,
        'verified_resolved': bool(verified_flag),
        'updated_at': now_iso
    }), 200

@app.route('/api/admin/complaints/<int:complaint_id>/assign', methods=['POST'])
@admin_required
def admin_assign_complaint(complaint_id):
    """Assign complaint to a designated staff member or field unit."""
    data = request.get_json(silent=True) or request.form
    assigned_to = data.get('assigned_to', '').strip()

    if not assigned_to:
        return jsonify({'success': False, 'message': 'Staff name or department required.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM complaints WHERE id = ?", (complaint_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    now_iso = datetime.now(timezone.utc).isoformat()
    updater = session.get('official_name', 'Panchayat Official')

    cursor.execute("UPDATE complaints SET assigned_to = ? WHERE id = ?", (assigned_to, complaint_id))

    # If currently Submitted, automatically transition to 'Assigned'
    if row['status'] == 'Submitted':
        cursor.execute("UPDATE complaints SET status = 'Assigned' WHERE id = ?", (complaint_id,))
        cursor.execute("""
            INSERT INTO status_history (complaint_id, status, officer_note, updated_at)
            VALUES (?, 'Assigned', ?, ?)
        """, (complaint_id, f"Assigned to {assigned_to} by {updater}", now_iso))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': f"Assigned to {assigned_to} successfully.",
        'assigned_to': assigned_to
    }), 200

@app.route('/api/admin/complaints/<int:complaint_id>/priority', methods=['POST'])
@admin_required
def admin_set_priority(complaint_id):
    """Set complaint urgency priority."""
    data = request.get_json(silent=True) or request.form
    priority = data.get('priority', '').strip()

    if priority not in VALID_PRIORITIES:
        return jsonify({'success': False, 'message': f"Invalid priority. Choose from: {', '.join(VALID_PRIORITIES)}"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT category, created_at FROM complaints WHERE id = ?", (complaint_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Complaint not found.'}), 404

    created_dt = datetime.fromisoformat(row['created_at'])
    new_target = calculate_target_date(row['category'], priority, created_dt)

    cursor.execute("""
        UPDATE complaints
        SET priority = ?, target_resolution_date = ?
        WHERE id = ?
    """, (priority, new_target, complaint_id))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'message': f"Priority updated to {priority}.",
        'priority': priority,
        'new_target_date': new_target
    }), 200

# --------------------------------------------------------------------------
# TRANSPARENCY DASHBOARD (REAL DATABASE STATISTICS)
# --------------------------------------------------------------------------
@app.route('/api/transparency/stats', methods=['GET'])
def get_transparency_stats():
    """
    Calculate and stream real metrics from the SQLite database.
    Privacy Protection: Groups sparsely populated wards into 'Other Local Wards' (< 2 items).
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. High-level metric counts
    cursor.execute("SELECT COUNT(*) FROM complaints;")
    total_complaints = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Submitted', 'Under Review');")
    pending_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE status = 'Under Review';")
    under_review_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Assigned', 'In Progress');")
    in_progress_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE status IN ('Resolved', 'Closed');")
    reported_resolved_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE verified_resolved = 1 OR status = 'Closed';")
    verified_resolved_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM complaints WHERE reopened_count > 0;")
    reopened_count = cursor.fetchone()[0]

    # 2. Overdue complaints count
    cursor.execute("""
        SELECT COUNT(*) FROM complaints
        WHERE status NOT IN ('Resolved', 'Closed')
          AND target_resolution_date IS NOT NULL
          AND target_resolution_date < datetime('now');
    """)
    overdue_count = cursor.fetchone()[0]

    # 3. Category distribution
    cursor.execute("""
        SELECT category, COUNT(*) as count
        FROM complaints
        GROUP BY category
        ORDER BY count DESC;
    """)
    category_counts = {row['category']: row['count'] for row in cursor.fetchall()}

    # 4. Ward-wise distribution with privacy threshold (< 2 grouped)
    cursor.execute("""
        SELECT village_name, COUNT(*) as count
        FROM complaints
        GROUP BY village_name
        ORDER BY count DESC;
    """)
    ward_rows = cursor.fetchall()
    ward_stats = {}
    other_wards_count = 0

    for w in ward_rows:
        if w['count'] >= 2:
            ward_stats[w['village_name']] = w['count']
        else:
            other_wards_count += w['count']

    if other_wards_count > 0:
        ward_stats['Other Village Wards (Aggregated for Privacy)'] = other_wards_count

    # 5. Average Resolution Time calculation (created_at -> first Resolved update)
    cursor.execute("""
        SELECT c.created_at, MIN(h.updated_at) as resolved_at
        FROM complaints c
        JOIN status_history h ON c.id = h.complaint_id
        WHERE h.status IN ('Resolved', 'Closed')
        GROUP BY c.id;
    """)
    time_rows = cursor.fetchall()
    total_hours = 0
    resolved_tickets_count = len(time_rows)

    for tr in time_rows:
        try:
            start_dt = datetime.fromisoformat(tr['created_at'])
            end_dt = datetime.fromisoformat(tr['resolved_at'])
            hours = (end_dt - start_dt).total_seconds() / 3600.0
            total_hours += max(0, hours)
        except Exception:
            pass

    avg_resolution_days = round(total_hours / (resolved_tickets_count * 24), 1) if resolved_tickets_count > 0 else 0.0

    conn.close()

    now_iso = datetime.now(timezone.utc).isoformat()

    return jsonify({
        'success': True,
        'data_source': 'Gram Panchayat SQLite Database (Real Civic Ledger)',
        'reporting_period': 'All Records to Date',
        'last_updated': now_iso,
        'metrics': {
            'total_complaints': total_complaints,
            'pending_complaints': pending_count,
            'under_review': under_review_count,
            'in_progress': in_progress_count,
            'reported_resolved': reported_resolved_count,
            'verified_resolved': verified_resolved_count,
            'reopened_complaints': reopened_count,
            'overdue_complaints': overdue_count,
            'average_resolution_days': avg_resolution_days,
            'resolved_with_proof_count': resolved_tickets_count
        },
        'category_breakdown': category_counts,
        'ward_breakdown': ward_stats,
        'privacy_threshold_notice': (
            "Wards with fewer than 2 logged issues are aggregated into 'Other Village Wards' "
            "to prevent identification of individuals in small rural settlements."
        )
    }), 200

# --------------------------------------------------------------------------
# STATIC & WEB PAGE ROUTING
# --------------------------------------------------------------------------
@app.route('/')
def index_page():
    return send_from_directory(str(BASE_DIR), 'index.html')

@app.route('/submit-complaint.html')
@app.route('/submit-complaint')
def submit_page():
    return send_from_directory(str(BASE_DIR), 'submit-complaint.html')

@app.route('/admin.html')
@app.route('/admin')
def admin_page():
    return send_from_directory(str(BASE_DIR), 'admin.html')

@app.route('/api/uploads/<path:filename>')
def serve_upload(filename):
    clean_name = secure_filename(filename)
    return send_from_directory(str(UPLOAD_DIR), clean_name)

@app.route('/<path:filename>')
def static_proxy(filename):
    normalized = Path(filename).as_posix()
    if (normalized.startswith('data/') or normalized.startswith('data') or
            filename.endswith('.py') or filename.endswith('.db') or filename.startswith('.')):
        abort(404)

    file_path = (BASE_DIR / filename).resolve()
    if not str(file_path).startswith(str(BASE_DIR)) or str(file_path).startswith(str(DATA_DIR)):
        abort(404)
    if not file_path.is_file():
        abort(404)
    return send_from_directory(str(BASE_DIR), filename)

# --------------------------------------------------------------------------
# APPLICATION ENTRYPOINT
# --------------------------------------------------------------------------
if __name__ == '__main__':
    init_db()
    print("=" * 75)
    print("  GRAM PANCHAYAT TRANSPARENT COMPLAINT PORTAL - BACKEND SERVER (ACTIVE)")
    print(f"  Database Path: {DB_PATH}")
    print(f"  Uploads Path:  {UPLOAD_DIR}")
    print("  Portal URL:    http://127.0.0.1:5000")
    print("  Admin URL:     http://127.0.0.1:5000/admin.html")
    print("=" * 75)
    app.run(host='127.0.0.1', port=5000, debug=False)
