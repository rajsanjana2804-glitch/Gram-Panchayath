/**
 * GRAM PANCHAYAT TRANSPARENT COMPLAINT PORTAL
 * Admin & Official Grievance Management Console Logic
 * 
 * Features:
 *  - Official Authentication (PBKDF2 Session)
 *  - Real-time KPI Statistics (Total, Pending, Overdue, In Progress, Resolved)
 *  - Filterable Complaints Table (Category, Ward, Status, Priority, Overdue)
 *  - Private Citizen Contact Inspection (Restricted to Authorized Officials)
 *  - Automated Duplicate Complaint Suggestions
 *  - Status Updates with Remarks & Resolution Evidence Uploads
 *  - Staff Assignment & Urgency Priority Configuration
 *  - Immutable Milestone Audit History
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // DOM REFERENCES
  // --------------------------------------------------------------------------
  const loginScreen = document.getElementById('admin-login-screen');
  const workspace = document.getElementById('admin-workspace');
  const loginForm = document.getElementById('admin-login-form');
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const userBadge = document.getElementById('admin-user-badge');
  const officialNameSpan = document.getElementById('auth-official-name');
  const officialRoleSpan = document.getElementById('auth-official-role');
  const btnLogout = document.getElementById('btn-admin-logout');

  const kpiTotal = document.getElementById('kpi-total');
  const kpiPending = document.getElementById('kpi-pending');
  const kpiOverdue = document.getElementById('kpi-overdue');
  const kpiProgress = document.getElementById('kpi-progress');
  const kpiResolved = document.getElementById('kpi-resolved');

  const filterSearch = document.getElementById('filter-search');
  const filterStatus = document.getElementById('filter-status');
  const filterCategory = document.getElementById('filter-category');
  const filterPriority = document.getElementById('filter-priority');
  const filterOverdueOnly = document.getElementById('filter-overdue-only');
  const btnRefreshQueue = document.getElementById('btn-refresh-queue');
  const tableBody = document.getElementById('complaints-table-body');

  const detailModal = document.getElementById('complaint-detail-modal');
  const drawerBody = document.getElementById('drawer-body');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerCategoryPill = document.getElementById('drawer-category-pill');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');

  let activeOfficial = null;
  let currentOpenComplaintId = null;

  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION & SESSION MANAGEMENT
  // --------------------------------------------------------------------------
  const checkAuthSession = async () => {
    try {
      const res = await fetch('/api/admin/me');
      const data = await res.json();
      if (data.authenticated) {
        showWorkspace(data.official);
      } else {
        showLoginScreen();
      }
    } catch (err) {
      console.warn('Session check failed:', err);
      showLoginScreen();
    }
  };

  const showWorkspace = (official) => {
    activeOfficial = official;
    if (loginScreen) loginScreen.style.display = 'none';
    if (workspace) workspace.style.display = 'block';
    if (userBadge) userBadge.style.display = 'flex';
    if (officialNameSpan) officialNameSpan.textContent = official.full_name;
    if (officialRoleSpan) officialRoleSpan.textContent = `${official.role} • ${official.ward}`;

    const wardBadge = document.getElementById('ws-ward-badge');
    if (wardBadge) wardBadge.textContent = `${official.ward} Jurisdiction`;

    fetchComplaintsQueue();
  };

  const showLoginScreen = () => {
    activeOfficial = null;
    if (workspace) workspace.style.display = 'none';
    if (userBadge) userBadge.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'block';
  };

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginErrorMsg) loginErrorMsg.style.display = 'none';

    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;

    if (!username || !password) return;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showWorkspace(data.official);
      } else {
        if (loginErrorMsg) {
          loginErrorMsg.textContent = data.message || 'Invalid username or password.';
          loginErrorMsg.style.display = 'block';
        }
      }
    } catch (err) {
      if (loginErrorMsg) {
        loginErrorMsg.textContent = 'Server connection error. Please ensure backend is running.';
        loginErrorMsg.style.display = 'block';
      }
    }
  });

  btnLogout?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (e) {}
    showLoginScreen();
  });

  // Quick Demo Credentials Buttons
  document.querySelectorAll('.btn-demo-cred').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = btn.getAttribute('data-user');
      const p = btn.getAttribute('data-pass');
      if (usernameInput) usernameInput.value = u;
      if (passwordInput) passwordInput.value = p;
      loginForm?.dispatchEvent(new Event('submit'));
    });
  });

  // --------------------------------------------------------------------------
  // 2. FETCH & RENDER COMPLAINTS QUEUE
  // --------------------------------------------------------------------------
  const fetchComplaintsQueue = async () => {
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem;">
          <div style="font-size: 1.25rem; margin-bottom: 0.5rem;">⏳</div>
          <span>Loading complaints from SQLite database...</span>
        </td>
      </tr>
    `;

    const params = new URLSearchParams();
    if (filterStatus?.value) params.append('status', filterStatus.value);
    if (filterCategory?.value) params.append('category', filterCategory.value);
    if (filterPriority?.value) params.append('priority', filterPriority.value);
    if (filterSearch?.value.trim()) params.append('q', filterSearch.value.trim());
    if (filterOverdueOnly?.checked) params.append('overdue', 'true');

    try {
      const res = await fetch(`/api/admin/complaints?${params.toString()}`);
      if (res.status === 401) {
        showLoginScreen();
        return;
      }

      const data = await res.json();
      const list = data.complaints || [];

      // Update KPI Tiles
      let countPending = 0;
      let countOverdue = 0;
      let countProgress = 0;
      let countResolved = 0;

      list.forEach(item => {
        if (['Submitted', 'Under Review'].includes(item.status)) countPending++;
        if (['Assigned', 'In Progress'].includes(item.status)) countProgress++;
        if (['Resolved', 'Closed'].includes(item.status)) countResolved++;
        if (item.is_overdue) countOverdue++;
      });

      if (kpiTotal) kpiTotal.textContent = list.length;
      if (kpiPending) kpiPending.textContent = countPending;
      if (kpiOverdue) kpiOverdue.textContent = countOverdue;
      if (kpiProgress) kpiProgress.textContent = countProgress;
      if (kpiResolved) kpiResolved.textContent = countResolved;

      if (list.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
              No complaints match the selected filter criteria.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = list.map(c => {
        const priorityClass = `badge-priority-${c.priority.toLowerCase()}`;
        const statusClass = `status-badge ${c.status.toLowerCase().replace(/\s+/g, '-')}`;
        const overduePill = c.is_overdue
          ? `<span class="pill-overdue-alert" title="Target SLA deadline exceeded">⚠️ Overdue</span>`
          : `<span class="pill-on-time">On Target</span>`;

        const modeBadge = c.is_anonymous
          ? `<span class="mode-tag-anon" title="Anonymous submission">🔒 Anonymous</span>`
          : `<span class="mode-tag-ident" title="Citizen contact details on file">👤 Identified</span>`;

        const dateStr = new Date(c.created_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short'
        });

        return `
          <tr>
            <td>
              <strong class="ticket-code-cell">${c.public_id}</strong>
              <small class="table-subtext">${dateStr}</small>
            </td>
            <td>
              <strong>${c.category}</strong>
              <small class="table-subtext">${c.village_name}</small>
            </td>
            <td><span class="badge-priority ${priorityClass}">${c.priority}</span></td>
            <td><span class="${statusClass}">● ${c.status}</span></td>
            <td>${overduePill}</td>
            <td><span class="assigned-unit-text">${c.assigned_to}</span></td>
            <td>${modeBadge}</td>
            <td>
              <button type="button" class="btn btn-outline-nav btn-sm btn-open-drawer" data-id="${c.id}">
                <span>Manage</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Attach Drawer Click Handlers
      tableBody.querySelectorAll('.btn-open-drawer').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (id) openComplaintDrawer(parseInt(id, 10));
        });
      });

    } catch (err) {
      console.error('Error fetching complaints:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: #dc2626; padding: 2rem;">
            Failed to retrieve complaints from server. Please check backend status.
          </td>
        </tr>
      `;
    }
  };

  btnRefreshQueue?.addEventListener('click', fetchComplaintsQueue);
  filterStatus?.addEventListener('change', fetchComplaintsQueue);
  filterCategory?.addEventListener('change', fetchComplaintsQueue);
  filterPriority?.addEventListener('change', fetchComplaintsQueue);
  filterOverdueOnly?.addEventListener('change', fetchComplaintsQueue);

  let searchDebounce = null;
  filterSearch?.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(fetchComplaintsQueue, 300);
  });

  // --------------------------------------------------------------------------
  // 3. COMPLAINT DETAIL & DISPATCH DRAWER
  // --------------------------------------------------------------------------
  const openComplaintDrawer = async (complaintId) => {
    currentOpenComplaintId = complaintId;
    if (!detailModal || !drawerBody) return;

    drawerBody.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading complaint #${complaintId}...</div>`;
    detailModal.classList.add('show');
    detailModal.setAttribute('aria-hidden', 'false');

    try {
      const res = await fetch(`/api/admin/complaints/${complaintId}`);
      if (res.status === 401) {
        showLoginScreen();
        closeDrawer();
        return;
      }

      const data = await res.json();
      const c = data.complaint;

      if (drawerTitle) drawerTitle.textContent = `Ticket: ${c.public_id}`;
      if (drawerCategoryPill) drawerCategoryPill.textContent = c.category;

      const dateStr = new Date(c.created_at).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      // Citizen Attached Photo
      const photoHtml = c.photo_url ? `
        <div class="drawer-photo-box">
          <span class="drawer-sublabel">Citizen Problem Photograph:</span>
          <a href="${c.photo_url}" target="_blank" rel="noopener noreferrer">
            <img src="${c.photo_url}" alt="Citizen uploaded photo" class="drawer-photo-thumb">
          </a>
          <small class="field-hint">(Click photo to open full resolution in new tab)</small>
        </div>
      ` : '<div class="drawer-photo-box"><span class="field-hint">No photograph attached by citizen.</span></div>';

      // Private Citizen Contact Info (Staff Only)
      let contactHtml = '';
      if (!c.is_anonymous && c.contact) {
        contactHtml = `
          <div class="drawer-contact-card">
            <div class="dcc-header">
              <span class="dcc-tag">🔒 Confidential Contact Information</span>
              <span class="dcc-notice">For Official Verification Only</span>
            </div>
            <div class="dcc-grid">
              <div>
                <span class="dcc-label">Reporter Name:</span>
                <strong class="dcc-val">${c.contact.name || 'Not recorded'}</strong>
              </div>
              <div>
                <span class="dcc-label">Mobile Phone:</span>
                <strong class="dcc-val"><a href="tel:${c.contact.phone}" style="color: var(--green-primary);">${c.contact.phone}</a></strong>
              </div>
              <div>
                <span class="dcc-label">Email:</span>
                <strong class="dcc-val">${c.contact.email || 'None'}</strong>
              </div>
            </div>
          </div>
        `;
      } else {
        contactHtml = `
          <div class="drawer-contact-card anon-card">
            <div class="dcc-header">
              <span class="dcc-tag" style="color: var(--green-dark);">🔒 100% Anonymous Submission</span>
            </div>
            <p class="field-hint" style="margin: 0;">
              No citizen identity, phone, or email is stored in the database for this grievance.
            </p>
          </div>
        `;
      }

      // Potential Duplicate Suggestions
      let duplicatesHtml = '';
      if (c.suggested_duplicates && c.suggested_duplicates.length > 0) {
        duplicatesHtml = `
          <div class="drawer-duplicate-alert">
            <div class="dup-header">
              <span>⚡ Potential Duplicate Issue Detected in Same Ward</span>
              <span class="dup-count-badge">${c.suggested_duplicates.length} Match(es)</span>
            </div>
            <div class="dup-list">
              ${c.suggested_duplicates.map(d => `
                <div class="dup-item">
                  <div class="dup-item-top">
                    <strong>Ref: ${d.public_id}</strong>
                    <span class="dup-sim-pill">${d.similarity_pct}% Similarity</span>
                    <span class="status-badge" style="font-size: 0.7rem; padding: 0.1rem 0.4rem;">${d.status}</span>
                  </div>
                  <div class="dup-snippet">${d.snippet}</div>
                  <div class="field-hint" style="font-size: 0.75rem;">Spot: ${d.location}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      // History Timeline
      const historyHtml = (c.history || []).map((h, i) => {
        const hDate = new Date(h.updated_at).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
        });
        const resPhotoHtml = h.resolution_photo_url ? `
          <div style="margin-top: 0.45rem;">
            <a href="${h.resolution_photo_url}" target="_blank">
              <img src="${h.resolution_photo_url}" alt="Resolution proof" style="max-height: 90px; border-radius: 4px; border: 1px solid var(--border-subtle);">
            </a>
            <span style="display: block; font-size: 0.7rem; color: var(--green-primary); font-weight: 600;">📎 Attached Resolution Photo Proof</span>
          </div>
        ` : '';

        return `
          <div class="drawer-timeline-item">
            <div class="dti-dot" aria-hidden="true"></div>
            <div class="dti-content">
              <div class="dti-header">
                <strong>Milestone: ${h.status}</strong>
                <span class="dti-date">${hDate}</span>
              </div>
              <p class="dti-note">${h.officer_note}</p>
              ${resPhotoHtml}
            </div>
          </div>
        `;
      }).join('');

      drawerBody.innerHTML = `
        <!-- Top Metadata Grid -->
        <div class="drawer-meta-grid">
          <div>
            <span class="drawer-sublabel">Location / Ward:</span>
            <strong>${c.village_name}</strong>
          </div>
          <div>
            <span class="drawer-sublabel">Reported On:</span>
            <strong>${dateStr}</strong>
          </div>
          <div>
            <span class="drawer-sublabel">Current Status:</span>
            <span class="status-badge ${c.status.toLowerCase().replace(/\s+/g, '-')}">● ${c.status}</span>
          </div>
          <div>
            <span class="drawer-sublabel">Target SLA:</span>
            <strong>${c.is_overdue ? '⚠️ Overdue' : 'On Schedule'}</strong>
          </div>
        </div>

        <!-- Problem Description -->
        <div class="drawer-section">
          <span class="drawer-sublabel">Specific Landmarks &amp; Spot:</span>
          <p class="drawer-text-box">${c.problem_location}</p>
        </div>

        <div class="drawer-section">
          <span class="drawer-sublabel">Citizen Problem Description:</span>
          <p class="drawer-text-box">${c.description}</p>
        </div>

        ${photoHtml}
        ${contactHtml}
        ${duplicatesHtml}

        <!-- MANAGEMENT ACTIONS FORM -->
        <div class="drawer-action-card">
          <h4 class="dac-title">Official Action &amp; Dispatch Controls</h4>

          <!-- 1. Assignment & Priority Controls -->
          <div class="form-row" style="margin-bottom: 1.25rem;">
            <div class="form-group flex-1">
              <label for="assign-staff-select" class="field-label">Assign Field Unit / Staff:</label>
              <div style="display: flex; gap: 0.5rem;">
                <select id="assign-staff-select" class="field-select">
                  <option value="">-- Choose Unit --</option>
                  <option value="Smt. Sunita Rao (Ward Grievance Officer)" ${c.assigned_to?.includes('Sunita') ? 'selected' : ''}>Smt. Sunita Rao (Ward Officer)</option>
                  <option value="Sri. H. Manjunath (Junior Engineer)" ${c.assigned_to?.includes('Manjunath') ? 'selected' : ''}>Sri. H. Manjunath (Junior Engineer)</option>
                  <option value="Drinking Water Maintenance Team" ${c.assigned_to?.includes('Water') ? 'selected' : ''}>Drinking Water Maintenance Team</option>
                  <option value="Streetlight & Electrical Contractor" ${c.assigned_to?.includes('Streetlight') ? 'selected' : ''}>Streetlight Contractor</option>
                  <option value="Public Sanitation & Health Team" ${c.assigned_to?.includes('Sanitation') ? 'selected' : ''}>Sanitation & Health Team</option>
                </select>
                <button type="button" id="btn-save-assign" class="btn btn-secondary" style="white-space: nowrap;">Assign</button>
              </div>
            </div>

            <div class="form-group flex-1">
              <label for="priority-select" class="field-label">Urgency Priority:</label>
              <div style="display: flex; gap: 0.5rem;">
                <select id="priority-select" class="field-select">
                  <option value="Low" ${c.priority === 'Low' ? 'selected' : ''}>Low</option>
                  <option value="Medium" ${c.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                  <option value="High" ${c.priority === 'High' ? 'selected' : ''}>High</option>
                  <option value="Urgent" ${c.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
                </select>
                <button type="button" id="btn-save-priority" class="btn btn-secondary" style="white-space: nowrap;">Set</button>
              </div>
            </div>
          </div>

          <!-- 2. Status Transition Form -->
          <form id="drawer-status-form" onsubmit="return false;">
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="new-status-select" class="field-label">Update Complaint Status <span class="required">*</span></label>
                <select id="new-status-select" class="field-select" required>
                  <option value="Under Review" ${c.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
                  <option value="Assigned" ${c.status === 'Assigned' ? 'selected' : ''}>Assigned</option>
                  <option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                  <option value="Resolved" ${c.status === 'Resolved' ? 'selected' : ''}>Resolved (Work Completed)</option>
                  <option value="Closed" ${c.status === 'Closed' ? 'selected' : ''}>Closed &amp; Verified</option>
                  <option value="Reopened" ${c.status === 'Reopened' ? 'selected' : ''}>Reopened for Re-inspection</option>
                </select>
              </div>

              <div class="form-group flex-1" style="display: flex; align-items: flex-end;">
                <label class="checkbox-wrap" style="padding-bottom: 0.75rem;">
                  <input type="checkbox" id="check-verified-resolved" ${c.verified_resolved ? 'checked' : ''}>
                  <span>Mark as Independently Verified by Ward Committee</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label for="officer-remarks" class="field-label">Official Action Remarks / Inspection Summary <span class="required">*</span></label>
              <textarea id="officer-remarks" class="field-textarea" rows="3" placeholder="Enter work order notes, contractor details, site inspection findings, or resolution explanation..." required minlength="5"></textarea>
            </div>

            <div class="form-group">
              <label for="resolution-photo-input" class="field-label">Upload Resolution Evidence Photo (Optional)</label>
              <input type="file" id="resolution-photo-input" accept="image/png, image/jpeg, image/webp" class="field-input">
              <small class="field-hint">Transparent proof uploaded here will be displayed to citizens on the public tracking portal.</small>
            </div>

            <div id="drawer-action-status" class="field-error" style="display: none; margin-bottom: 1rem;"></div>

            <button type="submit" id="btn-submit-status-update" class="btn btn-primary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
              <span>Record Status Update &amp; Action Proof</span>
            </button>
          </form>
        </div>

        <!-- Audit Trail -->
        <div class="drawer-section">
          <h4 class="dac-title" style="margin-bottom: 1rem;">Milestone Audit Trail &amp; History Log</h4>
          <div class="drawer-timeline">
            ${historyHtml}
          </div>
        </div>
      `;

      // Attach Drawer Action Listeners
      const btnSaveAssign = document.getElementById('btn-save-assign');
      const assignSelect = document.getElementById('assign-staff-select');
      btnSaveAssign?.addEventListener('click', async () => {
        const val = assignSelect?.value;
        if (!val) { alert('Please choose a staff member.'); return; }
        await fetch(`/api/admin/complaints/${complaintId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to: val })
        });
        openComplaintDrawer(complaintId);
        fetchComplaintsQueue();
      });

      const btnSavePriority = document.getElementById('btn-save-priority');
      const prioritySelect = document.getElementById('priority-select');
      btnSavePriority?.addEventListener('click', async () => {
        const pVal = prioritySelect?.value;
        await fetch(`/api/admin/complaints/${complaintId}/priority`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: pVal })
        });
        openComplaintDrawer(complaintId);
        fetchComplaintsQueue();
      });

      const statusForm = document.getElementById('drawer-status-form');
      statusForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newStatus = document.getElementById('new-status-select').value;
        const remarks = document.getElementById('officer-remarks').value.trim();
        const isVerified = document.getElementById('check-verified-resolved').checked;
        const photoFile = document.getElementById('resolution-photo-input').files[0];
        const statusBox = document.getElementById('drawer-action-status');

        if (!remarks || remarks.length < 5) {
          if (statusBox) {
            statusBox.textContent = 'Please enter an action remark (min 5 characters).';
            statusBox.style.display = 'block';
          }
          return;
        }

        const fData = new FormData();
        fData.append('status', newStatus);
        fData.append('officer_remarks', remarks);
        fData.append('verified_resolved', isVerified ? 'true' : 'false');
        if (photoFile) fData.append('resolution_photo', photoFile);

        const btnSave = document.getElementById('btn-submit-status-update');
        btnSave.disabled = true;

        try {
          const resp = await fetch(`/api/admin/complaints/${complaintId}/update-status`, {
            method: 'POST',
            body: fData
          });
          const resJson = await resp.json();

          if (resp.ok && resJson.success) {
            openComplaintDrawer(complaintId);
            fetchComplaintsQueue();
          } else {
            if (statusBox) {
              statusBox.textContent = resJson.message || 'Error updating status.';
              statusBox.style.display = 'block';
            }
            btnSave.disabled = false;
          }
        } catch (err) {
          if (statusBox) {
            statusBox.textContent = 'Network error while recording update.';
            statusBox.style.display = 'block';
          }
          btnSave.disabled = false;
        }
      });

    } catch (err) {
      console.error('Error opening drawer:', err);
      drawerBody.innerHTML = `<div style="text-align: center; color: #dc2626; padding: 2rem;">Error loading complaint details.</div>`;
    }
  };

  const closeDrawer = () => {
    currentOpenComplaintId = null;
    if (detailModal) {
      detailModal.classList.remove('show');
      detailModal.setAttribute('aria-hidden', 'true');
    }
  };

  btnCloseDrawer?.addEventListener('click', closeDrawer);
  detailModal?.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDrawer();
  });

  // --------------------------------------------------------------------------
  // 4. ACCESSIBILITY CONTROLS
  // --------------------------------------------------------------------------
  const btnFontDecrease = document.getElementById('btn-font-decrease');
  const btnFontReset = document.getElementById('btn-font-reset');
  const btnFontIncrease = document.getElementById('btn-font-increase');
  const btnContrastToggle = document.getElementById('btn-contrast-toggle');

  const updateFontScale = (scale, activeBtn) => {
    document.documentElement.style.setProperty('--font-scale', scale);
    [btnFontDecrease, btnFontReset, btnFontIncrease].forEach(btn => btn?.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
  };

  btnFontDecrease?.addEventListener('click', () => updateFontScale(0.9, btnFontDecrease));
  btnFontReset?.addEventListener('click', () => updateFontScale(1.0, btnFontReset));
  btnFontIncrease?.addEventListener('click', () => updateFontScale(1.15, btnFontIncrease));

  btnContrastToggle?.addEventListener('click', () => {
    const isHighContrast = document.body.classList.toggle('high-contrast');
    btnContrastToggle.setAttribute('aria-pressed', String(isHighContrast));
  });

  // Initialize
  checkAuthSession();
});
