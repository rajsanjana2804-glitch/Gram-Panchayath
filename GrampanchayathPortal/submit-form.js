/**
 * GRAM PANCHAYAT TRANSPARENT COMPLAINT PORTAL
 * Stage 3: Complaint Registration Form Logic (Backend Integrated)
 * 
 * Features:
 *  - Submission Mode Switcher (Anonymous vs Identified)
 *  - Privacy & Follow-up Guidance
 *  - URL Category Pre-selection
 *  - Drag & Drop Photograph Preview
 *  - Real-time Character Counter
 *  - Client & Server Validation Integration
 *  - Real Database Registration with SQLite Backend
 *  - Secure Display of Public Reference ID and One-Time Tracking Secret
 *  - Technical Disclosure of Anonymity Limits (Infrastructure & ISP logs)
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. DOM ELEMENT REFERENCES
  // --------------------------------------------------------------------------
  const form = document.getElementById('complaint-registration-form');
  const btnSubmit = document.getElementById('btn-validate-form');
  const modeAnonymous = document.getElementById('mode-anonymous');
  const modeIdentified = document.getElementById('mode-identified');
  const labelModeAnonymous = document.getElementById('label-mode-anonymous');
  const labelModeIdentified = document.getElementById('label-mode-identified');
  const fieldsetIdentity = document.getElementById('fieldset-identity');
  const anonymousInfoBox = document.getElementById('anonymous-explanation-box');
  const identifiedInfoBox = document.getElementById('identified-explanation-box');

  const categorySelect = document.getElementById('complaint-category');
  const villageInput = document.getElementById('village-name');
  const locationInput = document.getElementById('problem-location');
  const dateInput = document.getElementById('date-noticed');
  const descTextarea = document.getElementById('complaint-description');
  const charCounter = document.getElementById('char-counter');

  const photoInput = document.getElementById('photo-upload');
  const dropzone = document.getElementById('upload-dropzone');
  const dropzonePrompt = document.getElementById('dropzone-prompt');
  const dropzonePreview = document.getElementById('dropzone-preview');
  const previewImage = document.getElementById('preview-image');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const btnRemovePhoto = document.getElementById('btn-remove-photo');
  const photoError = document.getElementById('photo-error');

  const citizenNameInput = document.getElementById('citizen-name');
  const citizenPhoneInput = document.getElementById('citizen-phone');
  const citizenEmailInput = document.getElementById('citizen-email');

  const errorSummaryBox = document.getElementById('error-summary-box');
  const errorSummaryList = document.getElementById('error-summary-list');
  const formCardSection = document.getElementById('form-card-section');
  const validationSuccessPanel = document.getElementById('validation-success-panel');
  const btnResetForm = document.getElementById('btn-reset-form');

  let currentSelectedPhoto = null;

  // Set maximum date for date-noticed to today
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('max', today);
  }

  // --------------------------------------------------------------------------
  // 2. SUBMISSION MODE SWITCHING LOGIC
  // --------------------------------------------------------------------------
  const updateSubmissionMode = (mode) => {
    if (mode === 'identified') {
      labelModeIdentified?.classList.add('active');
      labelModeAnonymous?.classList.remove('active');
      if (fieldsetIdentity) fieldsetIdentity.style.display = 'block';
      if (identifiedInfoBox) identifiedInfoBox.style.display = 'flex';
      if (anonymousInfoBox) anonymousInfoBox.style.display = 'none';

      citizenNameInput?.setAttribute('required', 'true');
      citizenPhoneInput?.setAttribute('required', 'true');
    } else {
      labelModeAnonymous?.classList.add('active');
      labelModeIdentified?.classList.remove('active');
      if (fieldsetIdentity) fieldsetIdentity.style.display = 'none';
      if (anonymousInfoBox) anonymousInfoBox.style.display = 'flex';
      if (identifiedInfoBox) identifiedInfoBox.style.display = 'none';

      citizenNameInput?.removeAttribute('required');
      citizenPhoneInput?.removeAttribute('required');
      clearFieldError(citizenNameInput, 'name-error');
      clearFieldError(citizenPhoneInput, 'phone-error');
      clearFieldError(citizenEmailInput, 'email-error');
    }
  };

  modeAnonymous?.addEventListener('change', () => updateSubmissionMode('anonymous'));
  modeIdentified?.addEventListener('change', () => updateSubmissionMode('identified'));

  labelModeAnonymous?.addEventListener('click', () => {
    if (modeAnonymous) {
      modeAnonymous.checked = true;
      updateSubmissionMode('anonymous');
    }
  });

  labelModeIdentified?.addEventListener('click', () => {
    if (modeIdentified) {
      modeIdentified.checked = true;
      updateSubmissionMode('identified');
    }
  });

  // --------------------------------------------------------------------------
  // 3. PRESELECT CATEGORY VIA URL PARAMETER
  // --------------------------------------------------------------------------
  const checkUrlCategory = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (!categoryParam || !categorySelect) return;

    const lowerParam = categoryParam.toLowerCase();
    for (let i = 0; i < categorySelect.options.length; i++) {
      const optVal = categorySelect.options[i].value.toLowerCase();
      const optText = categorySelect.options[i].text.toLowerCase();
      if (optVal.includes(lowerParam) || optText.includes(lowerParam)) {
        categorySelect.selectedIndex = i;
        break;
      }
    }
  };
  checkUrlCategory();

  // --------------------------------------------------------------------------
  // 4. DESCRIPTION CHARACTER COUNTER
  // --------------------------------------------------------------------------
  if (descTextarea && charCounter) {
    const updateCharCounter = () => {
      const length = descTextarea.value.length;
      charCounter.textContent = `${length} / 1000 characters`;
      if (length < 15 && length > 0) {
        charCounter.style.color = '#dc2626';
      } else {
        charCounter.style.color = 'var(--text-muted)';
      }
    };
    descTextarea.addEventListener('input', updateCharCounter);
  }

  // --------------------------------------------------------------------------
  // 5. PHOTOGRAPH UPLOAD & PREVIEW (DRAG & DROP)
  // --------------------------------------------------------------------------
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const handlePhotoSelection = (file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      if (photoError) {
        photoError.textContent = 'Invalid file type. Please upload a JPG, PNG, or WEBP image.';
        photoError.style.display = 'block';
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      if (photoError) {
        photoError.textContent = 'File exceeds 5 MB limit. Please choose a smaller photo.';
        photoError.style.display = 'block';
      }
      return;
    }

    if (photoError) photoError.style.display = 'none';
    currentSelectedPhoto = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImage) previewImage.src = e.target.result;
      if (previewFilename) previewFilename.textContent = file.name;
      if (previewFilesize) previewFilesize.textContent = formatFileSize(file.size);

      if (dropzonePrompt) dropzonePrompt.style.display = 'none';
      if (dropzonePreview) dropzonePreview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  };

  const resetPhotoUpload = () => {
    currentSelectedPhoto = null;
    if (photoInput) photoInput.value = '';
    if (previewImage) previewImage.src = '';
    if (dropzonePrompt) dropzonePrompt.style.display = 'flex';
    if (dropzonePreview) dropzonePreview.style.display = 'none';
    if (photoError) photoError.style.display = 'none';
  };

  if (dropzone && photoInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== btnRemovePhoto) {
        photoInput.click();
      }
    });

    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        photoInput.click();
      }
    });

    photoInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoSelection(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handlePhotoSelection(e.dataTransfer.files[0]);
      }
    });
  }

  btnRemovePhoto?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetPhotoUpload();
  });

  // --------------------------------------------------------------------------
  // 6. ACCESSIBLE FIELD VALIDATION HELPERS
  // --------------------------------------------------------------------------
  const showFieldError = (inputElement, errorElementId, message) => {
    if (!inputElement) return;
    inputElement.classList.add('is-invalid');
    inputElement.setAttribute('aria-invalid', 'true');

    const errEl = document.getElementById(errorElementId);
    if (errEl) {
      if (message) errEl.textContent = message;
      errEl.style.display = 'block';
    }
  };

  const clearFieldError = (inputElement, errorElementId) => {
    if (!inputElement) return;
    inputElement.classList.remove('is-invalid');
    inputElement.removeAttribute('aria-invalid');

    const errEl = document.getElementById(errorElementId);
    if (errEl) {
      errEl.style.display = 'none';
    }
  };

  const registerInputValidationClear = (inputEl, errorId) => {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => clearFieldError(inputEl, errorId));
    inputEl.addEventListener('change', () => clearFieldError(inputEl, errorId));
  };

  registerInputValidationClear(categorySelect, 'category-error');
  registerInputValidationClear(villageInput, 'village-error');
  registerInputValidationClear(locationInput, 'location-error');
  registerInputValidationClear(dateInput, 'date-error');
  registerInputValidationClear(descTextarea, 'desc-error');
  registerInputValidationClear(citizenNameInput, 'name-error');
  registerInputValidationClear(citizenPhoneInput, 'phone-error');
  registerInputValidationClear(citizenEmailInput, 'email-error');

  // Copy to clipboard helper
  window.copyToClipboard = (text, btnElement, successLabel = 'Copied!') => {
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btnElement.innerHTML;
      btnElement.classList.add('copied');
      btnElement.innerHTML = `<span>✓ ${successLabel}</span>`;
      setTimeout(() => {
        btnElement.classList.remove('copied');
        btnElement.innerHTML = originalText;
      }, 2500);
    }).catch(() => {
      alert(`Code: ${text}`);
    });
  };

  // --------------------------------------------------------------------------
  // 7. FORM SUBMISSION TO BACKEND (SQLITE + FLASK)
  // --------------------------------------------------------------------------
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const errors = [];
    let firstInvalidElement = null;

    const recordError = (element, errorId, message) => {
      showFieldError(element, errorId, message);
      errors.push({ element, message });
      if (!firstInvalidElement) firstInvalidElement = element;
    };

    // 1. Client-Side Validation Checks
    if (!categorySelect?.value) {
      recordError(categorySelect, 'category-error', 'Please choose a complaint category.');
    } else {
      clearFieldError(categorySelect, 'category-error');
    }

    const villageVal = villageInput?.value.trim();
    if (!villageVal || villageVal.length < 2) {
      recordError(villageInput, 'village-error', 'Please enter your village name or ward (at least 2 letters).');
    } else {
      clearFieldError(villageInput, 'village-error');
    }

    const locationVal = locationInput?.value.trim();
    if (!locationVal || locationVal.length < 5) {
      recordError(locationInput, 'location-error', 'Please provide specific location details or landmarks (at least 5 letters).');
    } else {
      clearFieldError(locationInput, 'location-error');
    }

    if (dateInput?.value) {
      const selectedDate = new Date(dateInput.value);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selectedDate > today) {
        recordError(dateInput, 'date-error', 'Date cannot be in the future.');
      } else {
        clearFieldError(dateInput, 'date-error');
      }
    } else {
      clearFieldError(dateInput, 'date-error');
    }

    const descVal = descTextarea?.value.trim();
    if (!descVal || descVal.length < 15) {
      recordError(descTextarea, 'desc-error', 'Please explain the problem in greater detail (minimum 15 characters).');
    } else {
      clearFieldError(descTextarea, 'desc-error');
    }

    const isIdentified = modeIdentified?.checked;
    if (isIdentified) {
      const nameVal = citizenNameInput?.value.trim();
      if (!nameVal || nameVal.length < 2) {
        recordError(citizenNameInput, 'name-error', 'Please enter your full name (minimum 2 characters).');
      } else {
        clearFieldError(citizenNameInput, 'name-error');
      }

      const phoneVal = citizenPhoneInput?.value.trim();
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneVal || !phoneRegex.test(phoneVal)) {
        recordError(citizenPhoneInput, 'phone-error', 'Please enter a valid 10-digit mobile phone number (starting with 6-9).');
      } else {
        clearFieldError(citizenPhoneInput, 'phone-error');
      }

      const emailVal = citizenEmailInput?.value.trim();
      if (emailVal) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailVal)) {
          recordError(citizenEmailInput, 'email-error', 'Please enter a valid email address or leave the field blank.');
        } else {
          clearFieldError(citizenEmailInput, 'email-error');
        }
      } else {
        clearFieldError(citizenEmailInput, 'email-error');
      }
    }

    if (errors.length > 0) {
      if (errorSummaryBox && errorSummaryList) {
        errorSummaryList.innerHTML = errors.map(err => `<li>${err.message}</li>`).join('');
        errorSummaryBox.style.display = 'flex';
        errorSummaryBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      firstInvalidElement?.focus();
      return;
    }

    if (errorSummaryBox) errorSummaryBox.style.display = 'none';

    // 2. Prepare Form Data Payload for Server
    const formData = new FormData();
    formData.append('complaint_category', categorySelect.value);
    formData.append('village_name', villageVal);
    formData.append('problem_location', locationVal);
    formData.append('date_noticed', dateInput.value || '');
    formData.append('complaint_description', descVal);
    formData.append('submission_mode', isIdentified ? 'identified' : 'anonymous');

    if (isIdentified) {
      formData.append('citizen_name', citizenNameInput.value.trim());
      formData.append('citizen_phone', citizenPhoneInput.value.trim());
      if (citizenEmailInput.value.trim()) {
        formData.append('citizen_email', citizenEmailInput.value.trim());
      }
    }

    if (currentSelectedPhoto) {
      formData.append('photo_upload', currentSelectedPhoto);
    }

    // Set Loading State
    const originalBtnHtml = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `
      <svg class="btn-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
      <span>Recording in Gram Panchayat Database...</span>
    `;

    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Handle server-side validation or internal errors
        const serverErrors = result.errors ? Object.values(result.errors) : [result.message || 'Server error occurred'];
        if (errorSummaryBox && errorSummaryList) {
          errorSummaryList.innerHTML = serverErrors.map(msg => `<li>${msg}</li>`).join('');
          errorSummaryBox.style.display = 'flex';
          errorSummaryBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalBtnHtml;
        return;
      }

      // ----------------------------------------------------------------------
      // 3. DISPLAY PERSISTENT DATABASE REGISTRATION CONFIRMATION SCREEN
      // ----------------------------------------------------------------------
      renderDatabaseSuccessPanel(result, {
        category: categorySelect.value,
        village: villageVal,
        location: locationVal,
        dateNoticed: dateInput.value || 'Not specified',
        description: descVal,
        isIdentified: isIdentified,
        citizenName: isIdentified ? citizenNameInput.value.trim() : null,
        citizenPhone: isIdentified ? citizenPhoneInput.value.trim() : null,
        photoAttached: currentSelectedPhoto ? currentSelectedPhoto.name : 'No photo uploaded'
      });

    } catch (networkError) {
      console.error('Submission error:', networkError);
      if (errorSummaryBox && errorSummaryList) {
        errorSummaryList.innerHTML = `<li>Cannot connect to backend server. Please verify that the Flask server is running at <code>http://127.0.0.1:5000</code>.</li>`;
        errorSummaryBox.style.display = 'flex';
        errorSummaryBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalBtnHtml;
    }
  });

  // --------------------------------------------------------------------------
  // 8. RENDER STAGE 3 CONFIRMATION WITH REAL TOKENS & SECURITY DISCLOSURES
  // --------------------------------------------------------------------------
  const renderDatabaseSuccessPanel = (serverData, localData) => {
    if (!formCardSection || !validationSuccessPanel) return;

    const formattedDate = new Date(serverData.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    validationSuccessPanel.innerHTML = `
      <div class="panel-header">
        <div class="success-badge-icon" aria-hidden="true">✓</div>
        <div>
          <span class="panel-tag">Stage 3 Database Insertion Confirmed</span>
          <h2 class="panel-title">Complaint Successfully Recorded in SQLite Ledger</h2>
        </div>
      </div>

      <!-- CREDENTIALS DISPLAY (PUBLIC ID + ONE-TIME TRACKING SECRET) -->
      <div class="credentials-display-container">
        
        <!-- Public Reference ID Card -->
        <div class="public-id-card">
          <div class="token-label-strip">
            <span class="token-type-tag">1. Public Reference Identifier</span>
            <span class="token-visibility-tag">Visible on Public Village Ledger</span>
          </div>
          <div class="token-row">
            <span class="token-code" id="display-public-id">${serverData.public_id}</span>
            <button type="button" class="btn-copy-action" onclick="copyToClipboard('${serverData.public_id}', this, 'Reference Copied!')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy Reference ID</span>
            </button>
          </div>
          <div class="field-hint" style="margin-top: 0.5rem;">
            Share this identifier openly with neighbors or ward committee members to track repair milestones.
          </div>
        </div>

        <!-- One-Time Cryptographic Tracking Secret Card -->
        <div class="secret-token-card">
          <div class="secret-label-strip">
            <span class="secret-type-tag">2. Private Tracking Secret (One-Time Token)</span>
            <span class="secret-visibility-tag">Keep Strictly Confidential</span>
          </div>
          <div class="token-row">
            <span class="secret-code" id="display-tracking-secret">${serverData.tracking_secret}</span>
            <button type="button" class="btn-copy-action" onclick="copyToClipboard('${serverData.tracking_secret}', this, 'Secret Copied!')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy Tracking Secret</span>
            </button>
          </div>

          <div class="secret-warning-callout">
            <strong>🔒 Cryptographic Storage Architecture:</strong>
            The server does <em>not</em> store this secret in plain text. Only an irreversible salted SHA-256 hash has been recorded in the database.
            Because of this zero-knowledge design, <strong>Panchayat staff cannot retrieve or reset this token if lost</strong>.
            Please write it down or copy it into your personal notes immediately.
          </div>
        </div>

      </div>

      <!-- RECORD SUMMARY TABLE -->
      <div class="summary-card">
        <h3 class="summary-heading">Recorded Complaint Parameters:</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="sum-label">Current Status:</span>
            <strong class="sum-value" style="color: var(--green-primary);">● ${serverData.status}</strong>
          </div>
          <div class="summary-item">
            <span class="sum-label">Recorded At (UTC):</span>
            <strong class="sum-value">${formattedDate}</strong>
          </div>
          <div class="summary-item">
            <span class="sum-label">Category:</span>
            <strong class="sum-value">${serverData.category}</strong>
          </div>
          <div class="summary-item">
            <span class="sum-label">Village / Ward:</span>
            <strong class="sum-value">${serverData.village_name}</strong>
          </div>
          <div class="summary-item full-span">
            <span class="sum-label">Specific Location:</span>
            <strong class="sum-value">${localData.location}</strong>
          </div>
          <div class="summary-item full-span">
            <span class="sum-label">Problem Description:</span>
            <p class="sum-text-block">${localData.description}</p>
          </div>
          <div class="summary-item">
            <span class="sum-label">Photo Evidence:</span>
            <strong class="sum-value">${localData.photoAttached}</strong>
          </div>
          <div class="summary-item">
            <span class="sum-label">Identity Level:</span>
            <strong class="sum-value" style="color: ${localData.isIdentified ? 'var(--navy-primary)' : 'var(--green-primary)'};">
              ${localData.isIdentified ? '👤 Identified (Contact stored isolated from public ledger)' : '🔒 100% Anonymous Citizen'}
            </strong>
          </div>
        </div>

        <!-- Disclosure on Anonymity Limits -->
        <details class="anonymity-limits-accordion">
          <summary>ℹ️ Technical Transparency: Limits of Digital Anonymity</summary>
          <p>
            <strong>Application Layer Guarantee:</strong>
            The Gram Panchayat portal does not ask for, log, or store your name, phone number, email, or device ID with anonymous tickets.
            Uploaded photos are automatically stripped of EXIF metadata (camera serial numbers and embedded GPS tags) before saving.
          </p>
          <p style="margin-top: 0.5rem;">
            <strong>Infrastructure Layer Considerations:</strong>
            Standard internet routing (telecom operators, cellular base stations, and internet service providers) automatically logs network connection IPs at the transport level.
            Citizens requiring full operational anonymity are advised to submit issues via shared public terminals or private browsing modes.
          </p>
        </details>
      </div>

      <!-- ACTIONS -->
      <div class="panel-actions">
        <a href="index.html?track=${encodeURIComponent(serverData.public_id)}#tracking-demo" class="btn btn-primary">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span>Track This Complaint on Homepage</span>
        </a>

        <button type="button" class="btn btn-secondary" onclick="window.location.reload();">
          <span>Register Another Complaint</span>
        </button>

        <a href="index.html" class="btn-text-back">Back to Portal Home</a>
      </div>
    `;

    formCardSection.style.display = 'none';
    validationSuccessPanel.style.display = 'block';
    validationSuccessPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // --------------------------------------------------------------------------
  // 9. FORM RESET HANDLER
  // --------------------------------------------------------------------------
  btnResetForm?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all entered details in this form?')) {
      form.reset();
      updateSubmissionMode('anonymous');
      resetPhotoUpload();
      if (charCounter) charCounter.textContent = '0 / 1000 characters';
      if (errorSummaryBox) errorSummaryBox.style.display = 'none';

      const allInputs = form.querySelectorAll('.field-input, .field-select, .field-textarea');
      allInputs.forEach(input => {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
      });
      const allErrors = form.querySelectorAll('.field-error');
      allErrors.forEach(err => err.style.display = 'none');
    }
  });

  // --------------------------------------------------------------------------
  // 10. ACCESSIBILITY CONTROLS
  // --------------------------------------------------------------------------
  const btnFontDecrease = document.getElementById('btn-font-decrease');
  const btnFontReset = document.getElementById('btn-font-reset');
  const btnFontIncrease = document.getElementById('btn-font-increase');
  const btnContrastToggle = document.getElementById('btn-contrast-toggle');
  const langSelector = document.getElementById('lang-selector');
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  const primaryNav = document.getElementById('primary-nav');

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

  langSelector?.addEventListener('change', (e) => {
    if (e.target.value === 'kn') {
      alert(
        'ಗ್ರಾಮ ಪಂಚಾಯತ್ ದೂರು ಪೋರ್ಟಲ್:\n\n' +
        'ದೂರು ನೋಂದಣಿ ಪುಟದ ಪೂರ್ಣ ಕನ್ನಡ ಆವೃತ್ತಿಯನ್ನು ಮುಂದಿನ ಹಂತದಲ್ಲಿ ಅಳವಡಿಸಲಾಗುವುದು.\n\n' +
        '(Full Kannada localization will be enabled in a future stage).'
      );
    }
  });

  if (navToggleBtn && primaryNav) {
    navToggleBtn.addEventListener('click', () => {
      const isExpanded = navToggleBtn.getAttribute('aria-expanded') === 'true';
      navToggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      primaryNav.classList.toggle('is-open');
    });
  }

  const currentYearSpan = document.getElementById('current-year');
  if (currentYearSpan) {
    currentYearSpan.textContent = new Date().getFullYear();
  }
});
