/**
 * GRAM PANCHAYAT TRANSPARENT COMPLAINT PORTAL
 * Frontend Prototype Interaction Script
 * Features:
 *  - Simulated Tracker System (Demonstrates resolution milestones & audit proof)
 *  - Interactive Prototype Complaint Submission with Reference Token Generation
 *  - Accessibility Controls (Font Resizing & High Contrast Mode)
 *  - Kannada / English Bilingual Selector (Stage 2 preview)
 *  - Mobile Navigation Toggle
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. SIMULATED COMPLAINT RECORDS (PROTOTYPE DEMONSTRATION DATA)
  // --------------------------------------------------------------------------
  // Note: These sample records are used solely to demonstrate how the
  // transparent tracking timeline and public ledger will function without a backend.
  const sampleDatabase = {
    'GP-DEMO-ROAD-01': {
      id: 'GP-DEMO-ROAD-01',
      category: 'Roads & Pathways (ರಸ್ತೆಗಳು)',
      ward: 'Ward 2 - Market & School Road',
      dateReported: '10 Oct 2026',
      anonymous: true,
      status: 'In Progress',
      statusCode: 'in-progress',
      currentStep: 3, // 1 to 4
      description: 'Deep potholes on the primary school access road causing water stagnation and bike skids during morning hours.',
      actionTaken: 'Junior Engineer inspected site on 11 Oct. Patchwork contractor allocated with 1.5 metric tonnes of asphalt mix. Work ongoing.',
      estimatedCompletion: '16 Oct 2026',
      timeline: [
        { label: 'Submitted', date: '10 Oct 2026, 09:30 AM', done: true },
        { label: 'Acknowledged', date: '11 Oct 2026, 11:15 AM', done: true },
        { label: 'Work In Progress', date: '13 Oct 2026, 02:00 PM', done: true, active: true },
        { label: 'Resolved & Verified', date: 'Estimated 16 Oct', done: false }
      ]
    },
    'GP-DEMO-WATER-02': {
      id: 'GP-DEMO-WATER-02',
      category: 'Water Supply (ಕುಡಿಯುವ ನೀರು)',
      ward: 'Ward 4 - East Extension',
      dateReported: '06 Oct 2026',
      anonymous: true,
      status: 'Resolved & Verified',
      statusCode: 'resolved',
      currentStep: 4,
      description: 'Borewell pump motor burned out after power fluctuations; community tap running dry for over 30 households.',
      actionTaken: 'Replacement 5HP submersible motor installed and verified by Ward Committee. Water supply restored and flow tested on 09 Oct 2026.',
      estimatedCompletion: 'Completed',
      timeline: [
        { label: 'Submitted', date: '06 Oct 2026, 08:15 AM', done: true },
        { label: 'Acknowledged', date: '06 Oct 2026, 02:00 PM', done: true },
        { label: 'Repair Dispatched', date: '07 Oct 2026, 10:00 AM', done: true },
        { label: 'Resolved & Verified', date: '09 Oct 2026, 04:30 PM', done: true, active: false }
      ]
    }
  };

  // --------------------------------------------------------------------------
  // 2. MOBILE NAVIGATION MENU
  // --------------------------------------------------------------------------
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  const primaryNav = document.getElementById('primary-nav');

  if (navToggleBtn && primaryNav) {
    navToggleBtn.addEventListener('click', () => {
      const isExpanded = navToggleBtn.getAttribute('aria-expanded') === 'true';
      navToggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      primaryNav.classList.toggle('is-open');
    });

    // Close mobile nav when clicking any nav link
    const navLinks = primaryNav.querySelectorAll('.nav-link, .btn');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navToggleBtn.setAttribute('aria-expanded', 'false');
        primaryNav.classList.remove('is-open');
      });
    });
  }

  // --------------------------------------------------------------------------
  // 3. ACCESSIBILITY CONTROLS (FONT RESIZING & CONTRAST)
  // --------------------------------------------------------------------------
  const btnFontDecrease = document.getElementById('btn-font-decrease');
  const btnFontReset = document.getElementById('btn-font-reset');
  const btnFontIncrease = document.getElementById('btn-font-increase');
  const btnContrastToggle = document.getElementById('btn-contrast-toggle');

  const updateFontScale = (scale, activeBtn) => {
    document.documentElement.style.setProperty('--font-scale', scale);
    [btnFontDecrease, btnFontReset, btnFontIncrease].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    if (activeBtn) activeBtn.classList.add('active');
  };

  if (btnFontDecrease) {
    btnFontDecrease.addEventListener('click', () => updateFontScale(0.9, btnFontDecrease));
  }
  if (btnFontReset) {
    btnFontReset.addEventListener('click', () => updateFontScale(1.0, btnFontReset));
  }
  if (btnFontIncrease) {
    btnFontIncrease.addEventListener('click', () => updateFontScale(1.15, btnFontIncrease));
  }

  if (btnContrastToggle) {
    btnContrastToggle.addEventListener('click', () => {
      const isHighContrast = document.body.classList.toggle('high-contrast');
      btnContrastToggle.setAttribute('aria-pressed', String(isHighContrast));
    });
  }

  // --------------------------------------------------------------------------
  // 4. LANGUAGE SELECTOR (STAGE 2 PREVIEW)
  // --------------------------------------------------------------------------
  const langSelector = document.getElementById('lang-selector');
  if (langSelector) {
    langSelector.addEventListener('change', (e) => {
      if (e.target.value === 'kn') {
        alert(
          'ಗ್ರಾಮ ಪಂಚಾಯತ್ ದೂರು ಪೋರ್ಟಲ್:\n\n' +
          'ಕನ್ನಡ ಭಾಷಾ ಆವೃತ್ತಿಯ ಪೂರ್ಣ ಬೆಂಬಲವನ್ನು ಎರಡನೇ ಹಂತದಲ್ಲಿ (Stage 2) ಅಳವಡಿಸಲಾಗುವುದು. ಪ್ರಸ್ತುತ ಪ್ರಮುಖ ವಿಭಾಗಗಳ ಶೀರ್ಷಿಕೆಗಳಲ್ಲಿ ಕನ್ನಡ ಅನುವಾದವನ್ನು ನೀಡಲಾಗಿದೆ.\n\n' +
          '(Full Kannada localization will be enabled in Stage 2. English remains default for prototype structure).'
        );
      }
    });
  }

  // --------------------------------------------------------------------------
  // 5. TRACKING DEMONSTRATION ENGINE
  // --------------------------------------------------------------------------
  const trackingInput = document.getElementById('tracking-input');
  const btnSearchTracking = document.getElementById('btn-search-tracking');
  const trackingResultPanel = document.getElementById('tracking-result-panel');
  const sampleIdButtons = document.querySelectorAll('.btn-sample-id');

  const renderTrackingResult = (complaint) => {
    if (!trackingResultPanel) return;

    if (!complaint) {
      trackingResultPanel.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem;">
          <div style="font-size: 2.25rem; margin-bottom: 0.75rem;" aria-hidden="true">🔍</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--navy-primary); margin-bottom: 0.5rem;">
            Complaint Reference Not Found
          </h3>
          <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto; font-size: 0.9rem;">
            Please verify the reference code or click one of the demo buttons above (e.g., <strong>GP-DEMO-ROAD-01</strong> or <strong>GP-DEMO-WATER-02</strong>) to inspect a simulated record.
          </p>
        </div>
      `;
      return;
    }

    // Build timeline HTML
    const timelineHtml = complaint.timeline.map((step, idx) => {
      const isCompleted = step.done ? 'completed' : '';
      const isActive = step.active ? 'active' : '';
      return `
        <div class="timeline-step ${isCompleted} ${isActive}">
          <div class="timeline-node" aria-hidden="true"></div>
          <div class="timeline-label">Step ${idx + 1}: ${step.label}</div>
          <div class="timeline-date">${step.date}</div>
        </div>
      `;
    }).join('');

    trackingResultPanel.innerHTML = `
      <div class="tracking-header">
        <div>
          <span class="ref-code-title">Ticket: ${complaint.id}</span>
          <div class="ref-meta">
            <span>Reported on: <strong>${complaint.dateReported}</strong></span> • 
            <span>Identity: <strong>${complaint.anonymous ? '🔒 100% Anonymous Citizen' : 'Public'}</strong></span>
          </div>
        </div>
        <div>
          <span class="status-badge ${complaint.statusCode}">
            ● ${complaint.status}
          </span>
        </div>
      </div>

      <!-- Milestone Timeline -->
      <div class="timeline" aria-label="Resolution progress steps">
        ${timelineHtml}
      </div>

      <!-- Complaint & Resolution Details Grid -->
      <div class="tracking-details-grid">
        <div>
          <div class="detail-row">
            <div class="detail-label">Issue Category</div>
            <div class="detail-value">${complaint.category}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Location / Ward</div>
            <div class="detail-value">${complaint.ward}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Problem Description</div>
            <div class="detail-value">${complaint.description}</div>
          </div>
        </div>

        <div>
          <div class="detail-row">
            <div class="detail-label">Expected Resolution</div>
            <div class="detail-value">${complaint.estimatedCompletion}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Audit Trail ID</div>
            <div class="detail-value"><code>AUDIT-GP-${complaint.id.replace('GP-', '')}</code></div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Assigned Supervisory Unit</div>
            <div class="detail-value">Gram Panchayat Public Works Sub-Committee</div>
          </div>
        </div>
      </div>

      <!-- Verifiable Action Proof Box -->
      <div class="proof-of-action-box">
        <div class="poa-title">📋 Transparent Action Log / Field Staff Note:</div>
        <div class="poa-text">${complaint.actionTaken}</div>
      </div>
    `;
  };

  const renderLiveRecord = (data) => {
    if (!trackingResultPanel) return;

    const formattedDate = new Date(data.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    const timelineHtml = (data.history || []).map((step, idx) => {
      const stepDate = new Date(step.updated_at).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
      });
      return `
        <div class="timeline-step completed active">
          <div class="timeline-node" aria-hidden="true"></div>
          <div class="timeline-label">Milestone ${idx + 1}: ${step.status}</div>
          <div class="timeline-date">${stepDate}</div>
        </div>
      `;
    }).join('') || `
      <div class="timeline-step completed active">
        <div class="timeline-node" aria-hidden="true"></div>
        <div class="timeline-label">Milestone 1: Submitted</div>
        <div class="timeline-date">${formattedDate}</div>
      </div>
    `;

    const photoHtml = data.photo_url ? `
      <div class="proof-of-action-box" style="margin-top: 1rem; border-left-color: var(--navy-primary); background-color: var(--navy-surface);">
        <div class="poa-title">📎 Attached Problem Photograph:</div>
        <div style="margin-top: 0.5rem;">
          <a href="${data.photo_url}" target="_blank" rel="noopener noreferrer">
            <img src="${data.photo_url}" alt="Problem photo" style="max-height: 180px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--border-subtle);">
          </a>
          <span style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">(Click to view full image in new tab)</span>
        </div>
      </div>
    ` : '';

    const latestOfficerNote = data.history && data.history.length > 0
      ? data.history[data.history.length - 1].officer_note
      : 'Ticket officially registered in SQLite database. Awaiting field inspection schedule.';

    trackingResultPanel.innerHTML = `
      <div class="tracking-header">
        <div>
          <span class="ref-code-title">Ticket: ${data.public_id}</span>
          <div class="ref-meta">
            <span>Registered: <strong>${formattedDate}</strong></span> • 
            <span>Identity: <strong>${data.is_anonymous ? '🔒 100% Anonymous Citizen' : '👤 Identified Grievance'}</strong></span> •
            <span style="color: var(--green-primary); font-weight: 700;">🟢 Live Database Record</span>
          </div>
        </div>
        <div>
          <span class="status-badge ${data.status.toLowerCase().replace(/\s+/g, '-')}">
            ● ${data.status}
          </span>
        </div>
      </div>

      <!-- Milestone Timeline -->
      <div class="timeline" aria-label="Resolution progress steps">
        ${timelineHtml}
      </div>

      <!-- Complaint Details Grid -->
      <div class="tracking-details-grid">
        <div>
          <div class="detail-row">
            <div class="detail-label">Issue Category</div>
            <div class="detail-value">${data.category}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Location / Ward</div>
            <div class="detail-value">${data.village_name}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Specific Landmarks</div>
            <div class="detail-value">${data.problem_location}</div>
          </div>
        </div>

        <div>
          <div class="detail-row">
            <div class="detail-label">Date Noticed</div>
            <div class="detail-value">${data.date_noticed || 'Not specified'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Problem Description</div>
            <div class="detail-value">${data.description}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Assigned Supervisory Unit</div>
            <div class="detail-value">Gram Panchayat Public Grievance Cell</div>
          </div>
        </div>
      </div>

      ${photoHtml}

      <!-- Action Proof Note -->
      <div class="proof-of-action-box">
        <div class="poa-title">📋 Transparent Action Log / Field Staff Note:</div>
        <div class="poa-text">${latestOfficerNote}</div>
      </div>
    `;
  };

  const handleSearch = async () => {
    if (!trackingInput) return;
    const query = trackingInput.value.trim().toUpperCase();
    if (!query) {
      alert('Please enter a complaint reference code (e.g., GP-DEMO-ROAD-01 or your generated ID)');
      trackingInput.focus();
      return;
    }

    // Show temporary search loading state
    if (trackingResultPanel) {
      trackingResultPanel.innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⏳</div>
          <p style="color: var(--navy-primary); font-weight: 600;">Searching database for ${query}...</p>
        </div>
      `;
    }

    // 1. First, query live SQLite backend endpoint
    try {
      const response = await fetch(`/api/complaints/${encodeURIComponent(query)}`);
      if (response.ok) {
        const liveData = await response.json();
        if (liveData.success) {
          renderLiveRecord(liveData);
          return;
        }
      }
    } catch (err) {
      console.warn('Backend lookup failed or offline, checking demo cache:', err);
    }

    // 2. Fallback to sample demo mock records
    const sampleRecord = sampleDatabase[query];
    renderTrackingResult(sampleRecord);
  };

  if (btnSearchTracking) {
    btnSearchTracking.addEventListener('click', handleSearch);
  }

  if (trackingInput) {
    trackingInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    });
  }

  // Sample ID buttons click handler
  sampleIdButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleId = btn.getAttribute('data-sample-id');
      if (sampleId && trackingInput) {
        trackingInput.value = sampleId;
        renderTrackingResult(sampleDatabase[sampleId]);
      }
    });
  });

  // Check URL query param ?track=GP-2026-XXXXXX on load
  const urlParams = new URLSearchParams(window.location.search);
  const trackParam = urlParams.get('track');
  if (trackParam && trackingInput) {
    trackingInput.value = trackParam.trim().toUpperCase();
    handleSearch();
  } else {
    // Render the first sample on load as a preview
    renderTrackingResult(sampleDatabase['GP-DEMO-ROAD-01']);
  }

  // --------------------------------------------------------------------------
  // 6. PROTOTYPE COMPLAINT SUBMISSION MODAL
  // --------------------------------------------------------------------------
  const submitModal = document.getElementById('submit-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSubmitComplaint = document.getElementById('btn-submit-complaint');
  const compCategorySelect = document.getElementById('comp-category');
  const complaintForm = document.getElementById('prototype-complaint-form');
  const successScreen = document.getElementById('modal-success-screen');
  const generatedTokenText = document.getElementById('generated-token-text');
  const btnJumpToTracker = document.getElementById('btn-jump-to-tracker');
  const btnModalDone = document.getElementById('btn-modal-done');

  let newlyCreatedTicketId = null;

  const openModal = (preselectedCategory = '') => {
    if (!submitModal) return;
    if (complaintForm) complaintForm.style.display = 'block';
    if (successScreen) successScreen.style.display = 'none';

    if (preselectedCategory && compCategorySelect) {
      // Find matching option
      for (let i = 0; i < compCategorySelect.options.length; i++) {
        if (compCategorySelect.options[i].text.toLowerCase().includes(preselectedCategory.toLowerCase())) {
          compCategorySelect.selectedIndex = i;
          break;
        }
      }
    }

    submitModal.classList.add('show');
    submitModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  };

  const closeModal = () => {
    if (!submitModal) return;
    submitModal.classList.remove('show');
    submitModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  // Open modal triggers
  document.querySelectorAll('[data-action="open-submit-modal"]').forEach(btn => {
    btn.addEventListener('click', () => openModal());
  });

  // Category card clicks
  document.querySelectorAll('[data-action="category-click"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const catName = btn.getAttribute('data-cat-name') || '';
      openModal(catName);
    });
  });

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

  // Close modal when clicking on backdrop
  if (submitModal) {
    submitModal.addEventListener('click', (e) => {
      if (e.target === submitModal) closeModal();
    });
  }

  // Handle Prototype Complaint Submission
  if (btnSubmitComplaint) {
    btnSubmitComplaint.addEventListener('click', () => {
      const category = compCategorySelect ? compCategorySelect.value : 'General Civic Issue';
      const ward = document.getElementById('comp-ward') ? document.getElementById('comp-ward').value : 'Ward 1';
      const landmark = document.getElementById('comp-landmark') ? document.getElementById('comp-landmark').value.trim() : '';
      const description = document.getElementById('comp-description') ? document.getElementById('comp-description').value.trim() : '';
      const isAnonymous = document.getElementById('comp-anonymous') ? document.getElementById('comp-anonymous').checked : true;

      if (!landmark) {
        alert('Please provide a specific landmark or location.');
        document.getElementById('comp-landmark')?.focus();
        return;
      }

      if (!description) {
        alert('Please provide a brief problem description.');
        document.getElementById('comp-description')?.focus();
        return;
      }

      // Generate a realistic demonstration token
      const randomNum = Math.floor(100 + Math.random() * 900);
      const wardCode = ward.split(' ')[1] || 'W01';
      newlyCreatedTicketId = `GP-2026-${wardCode}-${randomNum}`;

      // Save into simulated database
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      sampleDatabase[newlyCreatedTicketId] = {
        id: newlyCreatedTicketId,
        category: category,
        ward: `${ward} (${landmark})`,
        dateReported: `${dateStr}, ${timeStr}`,
        anonymous: isAnonymous,
        status: 'Submitted & Queued for Inspection',
        statusCode: 'submitted',
        currentStep: 1,
        description: description,
        actionTaken: 'Ticket received in village digital ledger. Automatically scheduled for ward inspection team.',
        estimatedCompletion: 'Pending field survey within 48 hours',
        timeline: [
          { label: 'Submitted', date: `${dateStr}, ${timeStr}`, done: true, active: true },
          { label: 'Ward Review', date: 'Awaiting Officer', done: false },
          { label: 'Work Order', date: 'Pending', done: false },
          { label: 'Verified Resolution', date: 'Pending', done: false }
        ]
      };

      // Show success screen in modal
      if (complaintForm) complaintForm.style.display = 'none';
      if (generatedTokenText) generatedTokenText.textContent = newlyCreatedTicketId;
      if (successScreen) successScreen.style.display = 'block';

      // Clear input fields for next time
      document.getElementById('comp-landmark').value = '';
      document.getElementById('comp-description').value = '';
    });
  }

  // Jump from success modal to Tracker section
  if (btnJumpToTracker) {
    btnJumpToTracker.addEventListener('click', () => {
      closeModal();
      if (newlyCreatedTicketId && trackingInput) {
        trackingInput.value = newlyCreatedTicketId;
        renderTrackingResult(sampleDatabase[newlyCreatedTicketId]);

        const trackingSection = document.getElementById('tracking-demo');
        if (trackingSection) {
          trackingSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  }

  if (btnModalDone) {
    btnModalDone.addEventListener('click', closeModal);
  }

  // --------------------------------------------------------------------------
  // 7. FEEDBACK / SUGGESTION FORM SIMULATION
  // --------------------------------------------------------------------------
  const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
  const fbStatusMsg = document.getElementById('fb-status-msg');
  const fbMessage = document.getElementById('fb-message');

  if (btnSubmitFeedback && fbStatusMsg && fbMessage) {
    btnSubmitFeedback.addEventListener('click', () => {
      if (!fbMessage.value.trim()) {
        alert('Please write your suggestion before submitting.');
        fbMessage.focus();
        return;
      }

      fbStatusMsg.textContent = '✓ Thank you! Your suggestion for the prototype has been recorded.';
      fbStatusMsg.classList.add('success');
      fbMessage.value = '';
      if (document.getElementById('fb-name')) document.getElementById('fb-name').value = '';
      if (document.getElementById('fb-village')) document.getElementById('fb-village').value = '';

      setTimeout(() => {
        fbStatusMsg.style.display = 'none';
        fbStatusMsg.classList.remove('success');
      }, 4000);
    });
  }

  // --------------------------------------------------------------------------
  // 8. DYNAMIC YEAR
  // --------------------------------------------------------------------------
  const currentYearSpan = document.getElementById('current-year');
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }
});
