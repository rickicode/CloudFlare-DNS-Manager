// Main JavaScript file for Cloudflare DNS Manager

// Copy nameserver to clipboard function
function copyNameserverToClipboard(element) {
    const nameserver = element.getAttribute('data-nameserver');
    const feedback = element.querySelector('.copy-feedback');
    
    // Use modern clipboard API if available
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(nameserver).then(() => {
            showCopyFeedback(feedback);
        }).catch(() => {
            // Fallback to legacy method
            fallbackCopyToClipboard(nameserver, feedback);
        });
    } else {
        // Fallback for older browsers or non-secure contexts
        fallbackCopyToClipboard(nameserver, feedback);
    }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text, feedback) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopyFeedback(feedback);
    } catch (err) {
        console.error('Failed to copy nameserver:', err);
        showNotification('Failed to copy nameserver', 'error');
    }
    
    document.body.removeChild(textArea);
}

// Show copy feedback animation
function showCopyFeedback(feedbackElement) {
    if (feedbackElement) {
        feedbackElement.classList.add('show');
        setTimeout(() => {
            feedbackElement.classList.remove('show');
        }, 2000);
    }
    
    // Also show a notification
    showNotification('Nameserver copied to clipboard!', 'success');
}

// Credential storage configuration
const CREDENTIAL_STORAGE_KEY = 'cloudflare_dns_credentials_multiple';
const CREDENTIAL_EXPIRY_DAYS = 30;

// DNS Templates configuration
const DNS_TEMPLATES_STORAGE_KEY = 'cloudflare_dns_templates';
const DEFAULT_DNS_TEMPLATE = {
    name: 'Default Template',
    records: [
        'A|@|138.199.137.90|true',
        'CNAME|www|@|true',
        'CNAME|shop|@|true',
        'CNAME|buy|@|true',
        'CNAME|product|@|true'
    ]
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initApp();
});

// Multiple credential storage functions
function saveCredentials(email, apiKey) {
    const newCredential = {
        email: email,
        apiKey: apiKey,
        timestamp: Date.now(),
        expiryTime: Date.now() + (CREDENTIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        label: email // Use email as label for now
    };
    
    try {
        let storedCredentials = getAllStoredCredentials();
        
        // Check if this email already exists, if so update it
        const existingIndex = storedCredentials.findIndex(cred => cred.email === email);
        if (existingIndex !== -1) {
            storedCredentials[existingIndex] = newCredential;
        } else {
            storedCredentials.push(newCredential);
        }
        
        localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCredentials));
        return true;
    } catch (error) {
        console.error('Failed to save credentials:', error);
        return false;
    }
}

function getAllStoredCredentials() {
    try {
        const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
        if (!stored) return [];
        
        const credentials = JSON.parse(stored);
        
        // Filter out expired credentials
        const validCredentials = credentials.filter(cred => {
            return Date.now() <= cred.expiryTime;
        });
        
        // If some credentials were expired, save the filtered list
        if (validCredentials.length !== credentials.length) {
            localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(validCredentials));
        }
        
        return validCredentials;
    } catch (error) {
        console.error('Failed to load credentials:', error);
        clearCredentials();
        return [];
    }
}

function loadCredentials(email = null) {
    try {
        const allCredentials = getAllStoredCredentials();
        
        if (email) {
            // Return specific credential by email
            return allCredentials.find(cred => cred.email === email) || null;
        } else {
            // Return the most recently used credential
            if (allCredentials.length === 0) return null;
            return allCredentials.sort((a, b) => b.timestamp - a.timestamp)[0];
        }
    } catch (error) {
        console.error('Failed to load credentials:', error);
        return null;
    }
}

function clearCredentials(email = null) {
    try {
        if (email) {
            // Clear specific credential by email
            let storedCredentials = getAllStoredCredentials();
            storedCredentials = storedCredentials.filter(cred => cred.email !== email);
            localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCredentials));
        } else {
            // Clear all credentials
            localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
        }
    } catch (error) {
        console.error('Failed to clear credentials:', error);
    }
}

function hasStoredCredentials() {
    const credentials = getAllStoredCredentials();
    return credentials.length > 0;
}

// DNS Templates Management Functions
function loadDNSTemplates() {
    try {
        const stored = localStorage.getItem(DNS_TEMPLATES_STORAGE_KEY);
        if (!stored) {
            // Initialize with default template
            const defaultTemplates = {
                'default': DEFAULT_DNS_TEMPLATE
            };
            saveDNSTemplates(defaultTemplates);
            return defaultTemplates;
        }
        return JSON.parse(stored);
    } catch (error) {
        console.error('Failed to load DNS templates:', error);
        return { 'default': DEFAULT_DNS_TEMPLATE };
    }
}

function saveDNSTemplates(templates) {
    try {
        localStorage.setItem(DNS_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
        return true;
    } catch (error) {
        console.error('Failed to save DNS templates:', error);
        return false;
    }
}

function addDNSTemplate(name, records) {
    const templates = loadDNSTemplates();
    const templateId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    templates[templateId] = {
        name: name,
        records: records
    };
    
    return saveDNSTemplates(templates);
}

function deleteDNSTemplate(templateId) {
    const templates = loadDNSTemplates();
    
    // Don't allow deleting default template
    if (templateId === 'default') {
        return false;
    }
    
    delete templates[templateId];
    return saveDNSTemplates(templates);
}

function getDNSTemplateRecords(templateId) {
    const templates = loadDNSTemplates();
    return templates[templateId] ? templates[templateId].records : [];
}

// Check and load stored credentials on home page
function checkAndLoadStoredCredentials() {
    const allCredentials = getAllStoredCredentials();
    const savedCredentialsGroup = document.getElementById('saved-credentials-group');
    const savedCredentialsSelect = document.getElementById('saved-credentials-select');
    
    if (allCredentials.length > 0) {
        // Show the saved credentials dropdown
        if (savedCredentialsGroup) {
            savedCredentialsGroup.style.display = 'block';
        }
        
        // Populate the dropdown with saved credentials
        if (savedCredentialsSelect) {
            savedCredentialsSelect.innerHTML = '<option value="">Select saved credentials or enter new ones</option>';
            
            allCredentials.forEach((cred, index) => {
                const option = document.createElement('option');
                option.value = cred.email;
                option.textContent = `${cred.email} (saved ${new Date(cred.timestamp).toLocaleDateString()})`;
                savedCredentialsSelect.appendChild(option);
            });
            
            // Add event listener for credential selection
            savedCredentialsSelect.addEventListener('change', function() {
                const selectedEmail = this.value;
                if (selectedEmail) {
                    loadAndFillCredentials(selectedEmail);
                } else {
                    // Clear form when "Select saved credentials" is chosen
                    clearCredentialForm();
                }
            });
        }
        
        // Auto-fill with the most recent credential
        const mostRecent = loadCredentials();
        if (mostRecent) {
            loadAndFillCredentials(mostRecent.email);
            if (savedCredentialsSelect) {
                savedCredentialsSelect.value = mostRecent.email;
            }
        }
    }
}

// Load and fill credentials for a specific email
function loadAndFillCredentials(email) {
    const credentials = loadCredentials(email);
    if (credentials) {
        const emailField = document.getElementById('email');
        const apiKeyField = document.getElementById('api-key');
        const saveCheckbox = document.getElementById('save-credentials');
        
        if (emailField && apiKeyField) {
            emailField.value = credentials.email;
            apiKeyField.value = credentials.apiKey;
        }
        
        // Check the save credentials checkbox since we have stored credentials
        if (saveCheckbox) {
            saveCheckbox.checked = true;
        }
        
        // Show "Test API Credential" button
        showTestCredentialButton();
    }
}

// Clear the credential form
function clearCredentialForm() {
    const emailField = document.getElementById('email');
    const apiKeyField = document.getElementById('api-key');
    
    if (emailField) emailField.value = '';
    if (apiKeyField) apiKeyField.value = '';
    
    hideTestCredentialButton();
}

// Show test credential button instead of regular submit button
function showTestCredentialButton() {
    const apiForm = document.getElementById('api-form');
    if (!apiForm) return;
    
    const formActions = apiForm.querySelector('.form-actions');
    if (!formActions) return;
    
    // Hide the original submit button
    const originalSubmitBtn = formActions.querySelector('button[type="submit"]');
    if (originalSubmitBtn) {
        originalSubmitBtn.style.display = 'none';
    }
    
    // Check if test button already exists
    let testBtn = formActions.querySelector('#test-stored-credentials');
    if (!testBtn) {
        // Create test credential button
        testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.id = 'test-stored-credentials';
        testBtn.className = 'btn btn-success';
        testBtn.innerHTML = '<i class="fas fa-check-circle"></i> Test API Credentials';
        formActions.appendChild(testBtn);
        
        // Add event listener for test button
        testBtn.addEventListener('click', testCurrentCredentials);
    }
    
    // Add "Manage Saved Credentials" button
    let manageBtn = formActions.querySelector('#manage-saved-credentials');
    if (!manageBtn) {
        manageBtn = document.createElement('button');
        manageBtn.type = 'button';
        manageBtn.id = 'manage-saved-credentials';
        manageBtn.className = 'btn btn-outline';
        manageBtn.innerHTML = '<i class="fas fa-cog"></i> Manage Saved Credentials';
        formActions.appendChild(manageBtn);
        
        // Add event listener for manage button
        manageBtn.addEventListener('click', function() {
            openManageCredentialsModal();
        });
    }
}

// Hide test credential button and show original submit button
function hideTestCredentialButton() {
    const apiForm = document.getElementById('api-form');
    if (!apiForm) return;
    
    const formActions = apiForm.querySelector('.form-actions');
    if (!formActions) return;
    
    // Show the original submit button
    const originalSubmitBtn = formActions.querySelector('button[type="submit"]');
    if (originalSubmitBtn) {
        originalSubmitBtn.style.display = '';
    }
    
    // Remove test and manage buttons
    const testBtn = formActions.querySelector('#test-stored-credentials');
    const manageBtn = formActions.querySelector('#manage-saved-credentials');
    if (testBtn) testBtn.remove();
    if (manageBtn) manageBtn.remove();
}

// Test current form credentials
function testCurrentCredentials() {
    // Get credentials from the form (current input)
    const emailField = document.getElementById('email');
    const apiKeyField = document.getElementById('api-key');
    
    if (!emailField || !apiKeyField) {
        showNotification('Form fields not found', 'error');
        return;
    }
    
    const email = emailField.value.trim();
    const apiKey = apiKeyField.value.trim();
    
    if (!email || !apiKey) {
        showNotification('Please enter both email and API key', 'error');
        return;
    }
    
    const testBtn = document.getElementById('test-stored-credentials');
    const originalText = testBtn.textContent;
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    // Send validation request with current form credentials
    fetch('/validate-api', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email,
            apiKey: apiKey
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Check if user wants to save credentials
            const saveCredentialsCheckbox = document.getElementById('save-credentials');
            const shouldSave = saveCredentialsCheckbox && saveCredentialsCheckbox.checked;
            
            if (shouldSave) {
                const saved = saveCredentials(email, apiKey);
                if (saved) {
                    showNotification('API credentials validated and saved successfully!', 'success');
                } else {
                    showNotification('API credentials validated successfully! (Note: Failed to save for future use)', 'success');
                }
            } else {
                showNotification('API credentials validated successfully!', 'success');
            }
            
            setTimeout(() => {
                window.location.href = '/domains';
            }, 1000);
        } else {
            showNotification(`Error: ${data.message || 'Invalid stored credentials'}`, 'error');
            // Clear invalid credentials for the specific email
            clearCredentials(email);
            
            // Check if there are any remaining credentials
            if (!hasStoredCredentials()) {
                hideTestCredentialButton();
            }
        }
    })
    .catch(error => {
        showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
    })
    .finally(() => {
        // Re-enable button
        testBtn.disabled = false;
        testBtn.textContent = originalText;
    });
}

// DNS Templates Setup
function setupDNSTemplates() {
    // Load templates and populate select dropdown
    populateTemplateSelect();
    
    // Setup manage templates button
    const manageTemplatesBtn = document.getElementById('manage-templates-btn');
    if (manageTemplatesBtn) {
        manageTemplatesBtn.addEventListener('click', openTemplatesModal);
    }
    
    // Setup modal event listeners
    setupTemplatesModal();
}

// Populate template select dropdown
function populateTemplateSelect() {
    const templateSelect = document.getElementById('dns-template-select');
    if (!templateSelect) return;
    
    const templates = loadDNSTemplates();
    
    // Clear existing options except "No Template"
    templateSelect.innerHTML = '<option value="">No Template</option>';
    
    // Add templates to select
    Object.keys(templates).forEach(templateId => {
        const template = templates[templateId];
        const option = document.createElement('option');
        option.value = templateId;
        option.textContent = template.name;
        templateSelect.appendChild(option);
    });
}

// Open templates management modal
function openTemplatesModal() {
    const modal = document.getElementById('dns-templates-modal');
    if (modal) {
        modal.classList.add('active');
        populateTemplatesList();
    }
}

// Close templates modal
function closeTemplatesModal() {
    const modal = document.getElementById('dns-templates-modal');
    if (modal) {
        modal.classList.remove('active');
        // Clear form
        document.getElementById('template-name').value = '';
        document.getElementById('template-records').value = '';
    }
}

// Setup templates modal event listeners
function setupTemplatesModal() {
    const closeBtn = document.getElementById('close-templates-modal');
    const cancelBtn = document.getElementById('cancel-template');
    const saveBtn = document.getElementById('save-template');
    
    if (closeBtn) closeBtn.addEventListener('click', closeTemplatesModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTemplatesModal);
    if (saveBtn) saveBtn.addEventListener('click', saveNewTemplate);
    
    // Close modal when clicking outside
    const modal = document.getElementById('dns-templates-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeTemplatesModal();
            }
        });
    }
}

// Save new template
function saveNewTemplate() {
    const nameInput = document.getElementById('template-name');
    const recordsInput = document.getElementById('template-records');
    
    const name = nameInput.value.trim();
    const recordsText = recordsInput.value.trim();
    
    if (!name) {
        showNotification('Please enter a template name', 'error');
        return;
    }
    
    if (!recordsText) {
        showNotification('Please enter DNS records', 'error');
        return;
    }
    
    // Parse and validate records
    const records = recordsText.split('\n').filter(line => line.trim() !== '');
    let hasErrors = false;
    
    records.forEach(record => {
        const parts = record.split('|');
        if (parts.length < 3 || parts.length > 4) {
            showNotification(`Invalid record format: ${record}. Use TYPE|NAME|CONTENT or TYPE|NAME|CONTENT|PROXIED format.`, 'error');
            hasErrors = true;
        }
    });
    
    if (hasErrors) return;
    
    // Save template
    const saved = addDNSTemplate(name, records);
    if (saved) {
        showNotification('Template saved successfully!', 'success');
        populateTemplateSelect();
        populateTemplatesList();
        // Clear form
        nameInput.value = '';
        recordsInput.value = '';
    } else {
        showNotification('Failed to save template', 'error');
    }
}

// Populate templates list in modal
function populateTemplatesList() {
    const templatesList = document.getElementById('templates-list');
    if (!templatesList) return;
    
    const templates = loadDNSTemplates();
    templatesList.innerHTML = '';
    
    if (Object.keys(templates).length === 0) {
        templatesList.innerHTML = '<div class="no-templates">No templates found</div>';
        return;
    }
    
    Object.keys(templates).forEach(templateId => {
        const template = templates[templateId];
        const templateItem = document.createElement('div');
        templateItem.className = 'template-item';
        
        templateItem.innerHTML = `
            <div class="template-info">
                <div class="template-name">${template.name}</div>
                <div class="template-records-count">${template.records.length} DNS records</div>
            </div>
            <div class="template-actions">
                ${templateId !== 'default' ? `
                    <button class="edit-template" onclick="editTemplate('${templateId}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="delete-template" onclick="deleteTemplate('${templateId}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                ` : '<span style="color: #999; font-size: 12px;">Default template</span>'}
            </div>
        `;
        
        templatesList.appendChild(templateItem);
    });
}

// Edit template
function editTemplate(templateId) {
    const templates = loadDNSTemplates();
    const template = templates[templateId];
    
    if (!template) return;
    
    document.getElementById('template-name').value = template.name;
    document.getElementById('template-records').value = template.records.join('\n');
    
    // Change save button to update
    const saveBtn = document.getElementById('save-template');
    saveBtn.textContent = 'Update Template';
    saveBtn.onclick = () => updateTemplate(templateId);
}

// Update template
function updateTemplate(templateId) {
    const nameInput = document.getElementById('template-name');
    const recordsInput = document.getElementById('template-records');
    
    const name = nameInput.value.trim();
    const recordsText = recordsInput.value.trim();
    
    if (!name || !recordsText) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    const records = recordsText.split('\n').filter(line => line.trim() !== '');
    
    // Update template
    const templates = loadDNSTemplates();
    templates[templateId] = {
        name: name,
        records: records
    };
    
    const saved = saveDNSTemplates(templates);
    if (saved) {
        showNotification('Template updated successfully!', 'success');
        populateTemplateSelect();
        populateTemplatesList();
        
        // Reset form
        nameInput.value = '';
        recordsInput.value = '';
        const saveBtn = document.getElementById('save-template');
        saveBtn.textContent = 'Save Template';
        saveBtn.onclick = saveNewTemplate;
    } else {
        showNotification('Failed to update template', 'error');
    }
}

// Delete template
function deleteTemplate(templateId) {
    if (confirm('Are you sure you want to delete this template?')) {
        const deleted = deleteDNSTemplate(templateId);
        if (deleted) {
            showNotification('Template deleted successfully!', 'success');
            populateTemplateSelect();
            populateTemplatesList();
        } else {
            showNotification('Failed to delete template', 'error');
        }
    }
}

// Main app initialization
function initApp() {
    // Setup form handlers
    setupAPIForm();
    setupDomainSelect();
    setupDNSForm();
    setupAddDomainsForm();
    setupBulkDNSForm();
    setupDNSTemplates();
    setupModals();
    
    // Check if we're already on a specific page
    const path = window.location.pathname;
    if (path.startsWith('/dns/')) {
        // We're on the DNS management page for a specific domain
        const domain = path.replace('/dns/', '');
        loadDNSRecords(domain);
    } else if (path === '/domains') {
        // We're on the domains page
        // Setup search functionality
        setupDomainSearchWithPagination();
        
        // Load domains for table with pagination (20 per page)
        loadDomains(1, '', false);
    } else if (path === '/') {
        // We're on the home page, check for stored credentials
        checkAndLoadStoredCredentials();
        
        // Check for loading overlay
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            // Hide loading overlay after a short delay
            setTimeout(() => {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }, 800);
        }
    }
}
// Setup modal functionality
function setupModals() {
    // Edit record modal
    const editModal = document.getElementById('edit-record-modal');
    const closeEditBtn = document.getElementById('close-edit-modal');
    const cancelEditBtn = document.getElementById('cancel-edit');
    const saveRecordBtn = document.getElementById('save-record');
    
    if (closeEditBtn) {
        closeEditBtn.addEventListener('click', closeModals);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeModals);
    }
    
    if (saveRecordBtn) {
        saveRecordBtn.addEventListener('click', saveEditedRecord);
    }
    
    // Delete record modal
    const deleteModal = document.getElementById('delete-record-modal');
    const closeDeleteBtn = document.getElementById('close-delete-modal');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    
    if (closeDeleteBtn) {
        closeDeleteBtn.addEventListener('click', closeModals);
    }
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', closeModals);
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteRecord);
    }
    
    // Close modals when clicking outside
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === editModal) {
                closeModals();
            }
        });
    }
    
    if (deleteModal) {
        deleteModal.addEventListener('click', function(e) {
            if (e.target === deleteModal) {
                closeModals();
            }
        });
    }
    
    // Close modals with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModals();
        }
    });
}

// API Credential Form Setup
function setupAPIForm() {
    const apiForm = document.getElementById('api-form');
    if (!apiForm) return;

    apiForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const apiKey = document.getElementById('api-key').value;
        
        // Validate inputs
        if (!email || !apiKey) {
            showNotification('Please enter both email and API key', 'error');
            return;
        }
        
        // Disable form and show loading state
        const submitBtn = apiForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Validating...';
        
        // Send validation request
        fetch('/validate-api', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, apiKey }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Check if user wants to save credentials
                const saveCredentialsCheckbox = document.getElementById('save-credentials');
                const shouldSave = saveCredentialsCheckbox && saveCredentialsCheckbox.checked;
                
                if (shouldSave) {
                    const saved = saveCredentials(email, apiKey);
                    if (saved) {
                        showNotification('API credentials validated and saved successfully!', 'success');
                    } else {
                        showNotification('API credentials validated successfully! (Note: Failed to save for future use)', 'success');
                    }
                } else {
                    showNotification('API credentials validated successfully!', 'success');
                }
                
                setTimeout(() => {
                    window.location.href = '/domains';
                }, 1000);
            } else {
                showNotification(`Error: ${data.message || 'Invalid API credentials'}`, 'error');
            }
        })
        .catch(error => {
            showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
        })
        .finally(() => {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    });
}

// Add Domains Form Setup
function setupAddDomainsForm() {
    const addDomainsForm = document.getElementById('add-domains-form');
    if (!addDomainsForm) return;

    addDomainsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const domainsText = document.getElementById('domains-input').value.trim();
        
        // Validate inputs
        if (!domainsText) {
            showNotification('Please enter at least one domain', 'error');
            return;
        }
        
        // Basic validation for domains format
        const domainLines = domainsText.split('\n').filter(line => line.trim() !== '');
        let hasErrors = false;
        
        domainLines.forEach(line => {
            const domain = line.trim();
            if (!isValidDomainFormat(domain)) {
                showNotification(`Invalid domain format: ${domain}`, 'error');
                hasErrors = true;
            }
        });
        
        if (hasErrors) return;
        
        // Get selected DNS template
        const templateSelect = document.getElementById('dns-template-select');
        const selectedTemplate = templateSelect ? templateSelect.value : '';
        
        // Get template records if a template is selected
        let templateRecords = [];
        if (selectedTemplate) {
            templateRecords = getDNSTemplateRecords(selectedTemplate);
        }
        
        // Disable form and show loading state
        const submitBtn = addDomainsForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding Domains...';
        
        // Send add domains request
        fetch('/api/domains/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                domains: domainsText,
                template: selectedTemplate,
                templateRecords: templateRecords
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                
                // Display detailed results
                displayAddDomainsResults(data.results);
                
                // Clear the form
                document.getElementById('domains-input').value = '';
                
                // Reload domains list
                setTimeout(() => {
                    loadDomains();
                }, 2000);
            } else {
                showNotification(`Error: ${data.message || 'Failed to add domains'}`, 'error');
            }
        })
        .catch(error => {
            showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
        })
        .finally(() => {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    });
}

// Validate domain format (basic validation)
function isValidDomainFormat(domain) {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.([a-zA-Z]{2,}\.?)+$/;
    return domain.length >= 3 && domain.length <= 253 && domainRegex.test(domain);
}

// Display add domains results
function displayAddDomainsResults(results) {
    const resultsSection = document.getElementById('add-domains-results');
    const resultsContent = document.getElementById('add-domains-content');
    
    if (!resultsSection || !resultsContent) return;
    
    // Clear previous results
    resultsContent.innerHTML = '';
    
    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // Add summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'result-summary';
    summaryEl.innerHTML = `<strong>Summary:</strong> ${successCount} domains added successfully, ${failCount} failed.`;
    resultsContent.appendChild(summaryEl);
    
    // Add separator
    const separator = document.createElement('hr');
    separator.style.margin = '15px 0';
    separator.style.border = '0';
    separator.style.borderTop = '1px solid #ddd';
    resultsContent.appendChild(separator);
    
    // Add individual result items
    results.forEach(result => {
        const resultItem = document.createElement('div');
        
        // Set appropriate class based on result type
        let className = 'result-item domain-result';
        let icon = '';
        
        if (result.success) {
            className += ' success';
            icon = '<i class="fas fa-check-circle result-icon"></i>';
        } else {
            className += ' error';
            icon = '<i class="fas fa-times-circle result-icon"></i>';
        }
        
        resultItem.className = className;
        
        // Create content with nameservers if available
        let nameserversHtml = '';
        if (result.nameservers && result.nameservers.length > 0) {
            nameserversHtml = `
                <div class="nameservers-info">
                    <strong>Nameservers to configure at your domain registrar:</strong>
                    <ul class="nameservers-list">
                        ${result.nameservers.map(ns => `<li class="nameserver-item" data-nameserver="${ns}">${ns}<span class="copy-feedback">Copied!</span></li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        resultItem.innerHTML = `
            ${icon}
            <div class="result-details">
                <strong>${result.domain}</strong>
                <div class="result-message">${result.message}</div>
                ${result.error ? `<div class="error-details">${result.error}</div>` : ''}
                ${nameserversHtml}
            </div>
        `;
        
        resultsContent.appendChild(resultItem);
        
        // Add click event listeners to nameserver items after adding to DOM
        const nameserverItems = resultItem.querySelectorAll('.nameserver-item');
        nameserverItems.forEach(item => {
            item.addEventListener('click', function() {
                copyNameserverToClipboard(this);
            });
        });
    });
    
    // Show the results section
    resultsSection.classList.remove('hidden');
}

// Bulk DNS Form Setup
function setupBulkDNSForm() {
    const bulkDNSForm = document.getElementById('bulk-dns-form');
    if (!bulkDNSForm) return;

    bulkDNSForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const recordsText = document.getElementById('bulk-dns-input').value.trim();
        
        // Validate inputs
        if (!recordsText) {
            showNotification('Please enter at least one DNS record', 'error');
            return;
        }
        
        // Basic validation for DNS records format
        const recordLines = recordsText.split('\n').filter(line => line.trim() !== '');
        let hasErrors = false;
        
        recordLines.forEach(line => {
            const parts = line.trim().split('|');
            if (parts.length !== 4) {
                showNotification(`Invalid DNS record format: ${line.trim()} (expected TYPE|NAME|CONTENT|DOMAIN)`, 'error');
                hasErrors = true;
            } else {
                const domain = parts[3].trim();
                if (!isValidDomainFormat(domain)) {
                    showNotification(`Invalid domain format: ${domain}`, 'error');
                    hasErrors = true;
                }
            }
        });
        
        if (hasErrors) return;
        
        // Disable form and show loading state
        const submitBtn = bulkDNSForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding DNS Records...';
        
        // Send bulk DNS request
        fetch('/api/domains/bulk-dns', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                records: recordsText
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                
                // Display detailed results
                displayBulkDNSResults(data.results);
                
                // Clear the form
                document.getElementById('bulk-dns-input').value = '';
                
                // Reload domains list
                setTimeout(() => {
                    loadDomains();
                }, 2000);
            } else {
                showNotification(`Error: ${data.message || 'Failed to add DNS records'}`, 'error');
            }
        })
        .catch(error => {
            showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
        })
        .finally(() => {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    });
}

// Display bulk DNS results
function displayBulkDNSResults(results) {
    const resultsSection = document.getElementById('bulk-dns-results');
    const resultsContent = document.getElementById('bulk-dns-content');
    
    if (!resultsSection || !resultsContent) return;
    
    // Clear previous results
    resultsContent.innerHTML = '';
    
    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalRecords = results.reduce((sum, r) => sum + r.records_added, 0);
    
    // Add summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'result-summary';
    summaryEl.innerHTML = `<strong>Summary:</strong> Added ${totalRecords} DNS records across ${successCount} domains (${failCount} domains failed).`;
    resultsContent.appendChild(summaryEl);
    
    // Add separator
    const separator = document.createElement('hr');
    separator.style.margin = '15px 0';
    separator.style.border = '0';
    separator.style.borderTop = '1px solid #ddd';
    resultsContent.appendChild(separator);
    
    // Add individual result items
    results.forEach(result => {
        const resultItem = document.createElement('div');
        
        // Set appropriate class based on result type
        let className = 'result-item dns-result';
        let icon = '';
        
        if (result.success) {
            className += ' success';
            icon = '<i class="fas fa-check-circle result-icon"></i>';
        } else {
            className += ' error';
            icon = '<i class="fas fa-times-circle result-icon"></i>';
        }
        
        resultItem.className = className;
        
        // Create content with errors if available
        let errorsHtml = '';
        if (result.record_errors && result.record_errors.length > 0) {
            errorsHtml = `
                <div class="dns-errors">
                    <strong>Record Errors:</strong>
                    <ul class="error-list">
                        ${result.record_errors.map(error => `<li>${error}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
        
        resultItem.innerHTML = `
            ${icon}
            <div class="result-details">
                <strong>${result.domain}</strong>
                <div class="result-message">${result.message}</div>
                ${result.error ? `<div class="error-details">${result.error}</div>` : ''}
                ${errorsHtml}
            </div>
        `;
        
        resultsContent.appendChild(resultItem);
    });
    
    // Show the results section
    resultsSection.classList.remove('hidden');
}

// Domain Selection Setup - Modal with Pagination
function setupDomainSelect() {
    const openModalBtn = document.getElementById('open-domain-modal');
    const modal = document.getElementById('domain-selection-modal');
    const closeModalBtn = document.getElementById('close-domain-modal');
    const modalSearch = document.getElementById('modal-domain-search');
    const modalDomainsList = document.getElementById('modal-domains-list');
    const modalPagination = document.getElementById('modal-pagination');
    const selectedDomainInput = document.getElementById('selected-domain');
    const selectedDomainText = document.querySelector('.selected-domain-text');
    
    if (!openModalBtn || !modal) return;
    
    let currentPage = 1;
    let currentSearch = '';
    let totalPages = 1;
    
    // Preload modal data when page loads
    loadModalDomains(1, '');
    
    // Open modal
    openModalBtn.addEventListener('click', function() {
        modal.classList.add('active');
        // Focus on search field and select all text if there's existing search
        if (modalSearch) {
            modalSearch.focus();
            if (modalSearch.value) {
                modalSearch.select();
            }
        }
    });
    
    // Close modal
    closeModalBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
    });
    
    // Search functionality
    let searchTimeout;
    modalSearch?.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = searchTerm;
            loadModalDomains(1, searchTerm);
        }, 300);
    });
    
    // ESC key to close
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
    
    function closeModal() {
        modal.classList.remove('active');
        // Don't reset search and page when closing modal
        // This preserves the user's search state
    }
    
    function loadModalDomains(page = 1, search = '') {
        if (!modalDomainsList) return;
        
        modalDomainsList.innerHTML = `
            <tr>
                <td colspan="3" class="loading-row">
                    <i class="fas fa-spinner fa-spin"></i> Loading domains...
                </td>
            </tr>
        `;
        
        // Build URL with pagination - use 50 per page for modal to test scrolling
        let url = `/api/domains?page=${page}&per_page=10`;
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }
        
        // Use session-based authentication like the main domains table
        fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) {
                    modalDomainsList.innerHTML = `
                        <tr>
                            <td colspan="3" class="loading-row" style="color: var(--error-color);">
                                <i class="fas fa-exclamation-triangle"></i> Authentication required. Please refresh and configure API credentials.
                            </td>
                        </tr>
                    `;
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;
            
            if (!data.success) {
                throw new Error(data.message || 'Failed to load domains');
            }
            
            // Use the correct data structure
            const domains = data.data || [];
            const pagination = data.pagination || {};
            
            console.log('Modal API Response:', data); // Debug log
            console.log('Domains array:', domains); // Debug log
            
            displayModalDomains(domains);
            displayModalPagination(pagination);
            currentPage = page;
        })
        .catch(error => {
            console.error('Error loading domains:', error);
            modalDomainsList.innerHTML = `
                <tr>
                    <td colspan="3" class="loading-row" style="color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle"></i> ${error.message}
                    </td>
                </tr>
            `;
        });
    }
    
    function displayModalDomains(domains) {
        if (!modalDomainsList) return;
        
        if (domains.length === 0) {
            modalDomainsList.innerHTML = `
                <tr>
                    <td colspan="3" class="loading-row">
                        <i class="fas fa-search"></i> No domains found
                    </td>
                </tr>
            `;
            return;
        }
        
        modalDomainsList.innerHTML = '';
        
        domains.forEach(domain => {
            // Ensure we have the domain object structure
            const domainName = domain.name || domain.Name || 'Unknown Domain';
            const domainStatus = domain.status || domain.Status || 'unknown';
            
            const row = document.createElement('tr');
            row.className = 'records-row';
            
            row.innerHTML = `
                <td class="record-name">${escapeHtml(domainName)}</td>
                <td class="record-type">
                    <span class="status-badge status-${domainStatus.toLowerCase()}">${domainStatus.toUpperCase()}</span>
                </td>
                <td class="record-actions">
                    <button class="btn btn-sm btn-primary select-domain-btn" data-domain="${escapeHtml(domainName)}">
                        <i class="fas fa-arrow-right"></i> Select
                    </button>
                </td>
            `;
            
            // Add click event to the select button
            const selectBtn = row.querySelector('.select-domain-btn');
            selectBtn.addEventListener('click', function() {
                selectDomain(domainName);
            });
            
            // Add click event to the entire row for better UX
            row.addEventListener('click', function(e) {
                if (!e.target.closest('.select-domain-btn')) {
                    selectDomain(domainName);
                }
            });
            
            modalDomainsList.appendChild(row);
        });
        
        console.log('Displayed domains:', domains); // Debug log
    }
    
    function displayModalPagination(pagination) {
        if (!modalPagination) return;
        
        const { page = 1, per_page = 20, total_count = 0, total_pages = 1 } = pagination;
        
        if (total_pages <= 1) {
            modalPagination.innerHTML = '';
            return;
        }
        
        let paginationHTML = '<div class="pagination-info">';
        paginationHTML += `<span>Page ${page} of ${total_pages} (${total_count} domains)</span>`;
        paginationHTML += '</div>';
        
        paginationHTML += '<div class="pagination-controls">';
        
        // Previous button
        if (page > 1) {
            paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadModalDomainsPage(${page - 1})">
                <i class="fas fa-chevron-left"></i> Previous
            </button>`;
        }
        
        // Page numbers
        const maxPageLinks = 5;
        let startPage = Math.max(1, page - Math.floor(maxPageLinks / 2));
        let endPage = Math.min(total_pages, startPage + maxPageLinks - 1);
        
        if (endPage - startPage + 1 < maxPageLinks) {
            startPage = Math.max(1, endPage - maxPageLinks + 1);
        }
        
        if (startPage > 1) {
            paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadModalDomainsPage(1)">1</button>`;
            if (startPage > 2) {
                paginationHTML += '<span class="pagination-dots">...</span>';
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === page ? ' active' : '';
            paginationHTML += `<button class="btn btn-outline btn-sm${isActive}" onclick="loadModalDomainsPage(${i})">${i}</button>`;
        }
        
        if (endPage < total_pages) {
            if (endPage < total_pages - 1) {
                paginationHTML += '<span class="pagination-dots">...</span>';
            }
            paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadModalDomainsPage(${total_pages})">${total_pages}</button>`;
        }
        
        // Next button
        if (page < total_pages) {
            paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadModalDomainsPage(${page + 1})">
                Next <i class="fas fa-chevron-right"></i>
            </button>`;
        }
        
        paginationHTML += '</div>';
        modalPagination.innerHTML = paginationHTML;
    }
    
    function selectDomain(domainName) {
        // Update the hidden input
        if (selectedDomainInput) {
            selectedDomainInput.value = domainName;
        }
        
        // Update the button text
        if (selectedDomainText) {
            selectedDomainText.textContent = domainName;
            selectedDomainText.classList.add('has-value');
        }
        
        // Close modal
        closeModal();
        
        // Navigate to DNS management page
        window.location.href = `/dns/${domainName}`;
    }
    
    // Make functions available globally
    window.loadModalDomainsPage = function(page) {
        loadModalDomains(page, currentSearch);
    };
    
    window.refreshModalDomains = function() {
        loadModalDomains(currentPage, currentSearch);
    };
}

// Global variables for domains management
let allDomains = [];
let filteredDomains = [];
let currentDomainSortField = null;
let currentDomainSortDirection = 'asc';

// Load Domains with pagination
function loadDomains(page = 1, search = '', loadAll = false) {
    const domainsTable = document.querySelector('#domains-table tbody');
    const domainSelect = document.getElementById('domain-select');
    const domainSearchInput = document.getElementById('domain-search');
    
    if (!domainsTable && !domainSelect && !domainSearchInput) return;
    
    // Use 20 per page as requested to match Cloudflare's default
    const perPage = 20;
    
    // Show loading state for table
    if (domainsTable) {
        domainsTable.innerHTML = `
            <tr>
                <td colspan="4" class="loading-row">
                    <i class="fas fa-spinner fa-spin"></i> Loading domains...
                </td>
            </tr>
        `;
    }
    
    // Build query parameters
    const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString()
    });
    
    if (search) {
        queryParams.append('search', search);
    }
    
    // Fetch domains
    fetch(`/api/domains?${queryParams.toString()}`, {
        method: 'GET',
        credentials: 'same-origin', // Include cookies/session
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
    })
        .then(response => {
            // Check if response is ok
            if (!response.ok) {
                if (response.status === 401) {
                    // Unauthorized - redirect to home page
                    window.location.href = '/';
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Failed to load domains');
            }
            
            const domains = data.data || [];
            const pagination = data.pagination || {};
            
            // For table display (paginated)
            if (domainsTable && !loadAll) {
                allDomains = domains;
                filteredDomains = [...allDomains];
                displayDomains();
                updateDomainsCount();
                setupDomainSearchAndFilters();
                
                // Display pagination controls
                displayPaginationControls(pagination, page, search);
            }
            
            // Table view only - modal handles its own domain loading
        })
        .catch(error => {
            console.error('Error loading domains:', error);
            const errorMsg = `Error loading domains: ${error.message}`;
            if (domainsTable) {
                domainsTable.innerHTML = `
                    <tr>
                        <td colspan="4" class="loading-row" style="color: var(--error-color);">
                            <i class="fas fa-exclamation-triangle"></i> ${errorMsg}
                            <br><small>Check browser console for more details</small>
                        </td>
                    </tr>
                `;
            }
            
            // Handle error for searchable select
            if (domainSearchInput) {
                const domainDropdown = document.getElementById('domain-dropdown');
                if (domainDropdown) {
                    domainDropdown.innerHTML = `<div class="dropdown-loading" style="color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle"></i> ${errorMsg}
                    </div>`;
                }
                domainSearchInput.placeholder = 'Error loading domains';
            }
            
            showNotification(errorMsg, 'error');
        });
}

// Display domains in table format
function displayDomains() {
    const domainsTable = document.querySelector('#domains-table tbody');
    const noDomainsMessage = document.getElementById('no-domains-message');
    
    if (!domainsTable) return;
    
    if (!filteredDomains || filteredDomains.length === 0) {
        domainsTable.innerHTML = `
            <tr>
                <td colspan="4" class="loading-row">
                    <i class="fas fa-search"></i> No domains found
                </td>
            </tr>
        `;
        if (noDomainsMessage) {
            noDomainsMessage.classList.remove('hidden');
        }
        return;
    }
    
    if (noDomainsMessage) {
        noDomainsMessage.classList.add('hidden');
    }
    
    domainsTable.innerHTML = '';
    filteredDomains.forEach(domain => {
        const statusClass = `status-${domain.status.toLowerCase()}`;
        const createdDate = domain.created_on ? new Date(domain.created_on).toLocaleDateString() : 'Unknown';
        
        const row = document.createElement('tr');
        row.dataset.domainName = domain.name;
        
        row.innerHTML = `
            <td class="domain-name">${escapeHtml(domain.name)}</td>
            <td>
                <span class="domain-status ${statusClass}">${domain.status}</span>
            </td>
            <td class="domain-created">${createdDate}</td>
            <td class="domain-actions">
                <a href="/dns/${domain.name}" class="btn btn-sm" title="Manage DNS">
                    <i class="fas fa-cog"></i> Manage DNS
                </a>
            </td>
        `;
        
        domainsTable.appendChild(row);
    });
}

// Setup search and filter functionality for domains
function setupDomainSearchAndFilters() {
    const searchInput = document.getElementById('search-domains');
    const statusFilter = document.getElementById('status-filter');
    const resetFiltersBtn = document.getElementById('reset-domain-filters');
    const refreshBtn = document.getElementById('refresh-domains');
    
    if (searchInput) {
        searchInput.addEventListener('input', applyDomainFilters);
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Escape') {
                searchInput.value = '';
                applyDomainFilters();
            }
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', applyDomainFilters);
    }
    
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            if (statusFilter) statusFilter.value = '';
            applyDomainFilters();
        });
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadDomains();
            // Also refresh modal data
            refreshModalDomains();
        });
    }
}

// Apply search and filter logic for domains
function applyDomainFilters() {
    const searchTerm = document.getElementById('search-domains')?.value.toLowerCase().trim() || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';
    
    filteredDomains = allDomains.filter(domain => {
        // Search filter
        const matchesSearch = !searchTerm ||
            domain.name.toLowerCase().includes(searchTerm) ||
            domain.status.toLowerCase().includes(searchTerm);
        
        // Status filter
        const matchesStatus = !statusFilter || domain.status.toLowerCase() === statusFilter.toLowerCase();
        
        return matchesSearch && matchesStatus;
    });
    
    // Sort domains alphabetically by name
    filteredDomains.sort((a, b) => a.name.localeCompare(b.name));
    
    displayDomains();
    updateDomainsCount();
}


// Update domains count display
function updateDomainsCount() {
    const domainsCountEl = document.getElementById('domains-count');
    const filteredCountEl = document.getElementById('domains-filtered-count');
    
    if (domainsCountEl) {
        domainsCountEl.textContent = `Total: ${allDomains.length} domains`;
    }
    
    if (filteredCountEl) {
        if (filteredDomains.length !== allDomains.length) {
            filteredCountEl.textContent = `Showing: ${filteredDomains.length} domains`;
            filteredCountEl.classList.remove('hidden');
        } else {
            filteredCountEl.classList.add('hidden');
        }
    }
}

// DNS Form Setup
function setupDNSForm() {
    const dnsForm = document.getElementById('dns-form');
    if (!dnsForm) return;

    // Load DNS records on page load
    const domain = document.getElementById('domain-name')?.value;
    if (domain) {
        loadDNSRecords(domain);
    }
    
    // Setup DNS template selector for DNS page
    const dnsTemplateSelect = document.getElementById('dns-template-select-dns');
    if (dnsTemplateSelect) {
        dnsTemplateSelect.addEventListener('change', function() {
            const templateId = this.value;
            const dnsRecordsTextarea = document.getElementById('dns-records');
            
            if (!templateId || !dnsRecordsTextarea) {
                return;
            }
            
            // Get template records
            const templateRecords = getDNSTemplateRecords(templateId);
            if (templateRecords && templateRecords.length > 0) {
                // Fill textarea with template records
                dnsRecordsTextarea.value = templateRecords.join('\n');
                showNotification('Template loaded successfully!', 'success');
            }
        });
    }
    
    // Refresh records button
    const refreshBtn = document.getElementById('refresh-records');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            const domain = document.getElementById('domain-name')?.value;
            if (domain) {
                refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
                refreshBtn.disabled = true;
                
                setTimeout(() => {
                    loadDNSRecords(domain);
                    refreshBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
                    refreshBtn.disabled = false;
                }, 500);
            }
        });
    }

    dnsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const domain = document.getElementById('domain-name').value;
        const recordsText = document.getElementById('dns-records').value;
        
        if (!domain || !recordsText) {
            showNotification('Please enter both domain and DNS records', 'error');
            return;
        }
        
        // Disable form
        const submitBtn = dnsForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
        
        // Send DNS update request
        fetch(`/api/dns/${domain}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records: recordsText }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Always show a notification with meaningful message
                const message = data.message || 'DNS records processed successfully';
                showNotification(message, 'success');
                
                // Display results if available
                if (data.results && data.results.length > 0) {
                    displayResultsLog(data.results);
                    
                    // Count successful operations for additional feedback
                    const successCount = data.results.filter(r => r.success).length;
                    const totalCount = data.results.length;
                    
                    if (successCount > 0) {
                        // Show additional summary notification
                        setTimeout(() => {
                            showNotification(`✅ Successfully processed ${successCount} of ${totalCount} DNS records`, 'success');
                        }, 500);
                    }
                } else {
                    // If no results, show generic success
                    showNotification('✅ DNS records operation completed successfully', 'success');
                }
                
                // Reload DNS records
                loadDNSRecords(domain);
                
                // Clear the form after successful submission
                document.getElementById('dns-records').value = '';
            } else {
                const errorMessage = data.message || 'Failed to update DNS records';
                showNotification(`❌ Error: ${errorMessage}`, 'error');
            }
        })
        .catch(error => {
            showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
        })
        .finally(() => {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    });
}

// Load DNS Records
// Global variables for DNS records management
let allDNSRecords = [];
let filteredDNSRecords = [];
let currentSortField = null;
let currentSortDirection = 'asc';

function loadDNSRecords(domain, page = 1, search = '') {
    const tableBody = document.querySelector('#dns-records-table tbody');
    if (!tableBody) return;
    
    // Show loading state
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="loading-row">
                <i class="fas fa-spinner fa-spin"></i> Loading DNS records...
            </td>
        </tr>
    `;
    
    // Build query parameters
    const queryParams = new URLSearchParams({
        page: page.toString(),
        per_page: '20'
    });
    
    if (search) {
        queryParams.append('search', search);
    }
    
    fetch(`/api/dns/${domain}?${queryParams.toString()}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allDNSRecords = data.data || [];
                filteredDNSRecords = [...allDNSRecords];
                displayDNSRecords();
                updateRecordsCount();
                setupSearchAndFilters();
                setupBulkActions();
                
                // Display pagination controls
                displayDNSPaginationControls(data.pagination || {}, page, search);
            } else {
                throw new Error(data.message || 'Failed to load DNS records');
            }
        })
        .catch(error => {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading-row" style="color: var(--error-color);">
                        <i class="fas fa-exclamation-triangle"></i> Error loading DNS records: ${error.message}
                    </td>
                </tr>
            `;
            showNotification(`Error loading DNS records: ${error.message}`, 'error');
        });
}

// Enhanced DNS Records Display with search and filter support
function displayDNSRecords() {
    const tableBody = document.querySelector('#dns-records-table tbody');
    const noRecordsMessage = document.getElementById('no-records-message');
    
    if (!tableBody) return;
    
    if (!filteredDNSRecords || filteredDNSRecords.length === 0) {
        tableBody.innerHTML = '';
        if (noRecordsMessage) {
            noRecordsMessage.classList.remove('hidden');
        }
        return;
    }
    
    if (noRecordsMessage) {
        noRecordsMessage.classList.add('hidden');
    }
    
    let html = '';
    filteredDNSRecords.forEach(record => {
        const typeClass = `type-${record.type.toLowerCase()}`;
        const proxiedStatus = record.proxied ?
            '<span class="proxied-status proxied"><i class="fas fa-shield-alt"></i> Proxied</span>' :
            '<span class="proxied-status direct"><i class="fas fa-globe"></i> Direct</span>';
        
        html += `
            <tr data-record-id="${record.id}">
                <td>
                    <input type="checkbox" class="record-checkbox" value="${escapeHtml(record.id)}" data-record-type="${escapeHtml(record.type)}" data-record-name="${escapeHtml(record.name)}">
                </td>
                <td>
                    <span class="record-type-badge ${typeClass}">${record.type}</span>
                </td>
                <td class="record-name" title="${escapeHtml(record.name)}" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(record.name)}</td>
                <td class="record-content" title="${escapeHtml(record.content)}" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(record.content)}</td>
                <td>${proxiedStatus}</td>
                <td class="record-actions">
                    <button class="btn-icon btn-edit" data-record-id="${escapeHtml(record.id)}" data-record-type="${escapeHtml(record.type)}" data-record-name="${escapeHtml(record.name)}" data-record-content="${escapeHtml(record.content)}" data-record-proxied="${record.proxied}" title="Edit Record">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" data-record-id="${escapeHtml(record.id)}" data-record-type="${escapeHtml(record.type)}" data-record-name="${escapeHtml(record.name)}" data-record-content="${escapeHtml(record.content)}" title="Delete Record">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    
    // Add event listeners for edit and delete buttons
    tableBody.addEventListener('click', function(e) {
        const target = e.target.closest('button');
        if (!target) return;
        
        if (target.classList.contains('btn-edit')) {
            const recordId = target.dataset.recordId;
            const recordType = target.dataset.recordType;
            const recordName = target.dataset.recordName;
            const recordContent = target.dataset.recordContent;
            const recordProxied = target.dataset.recordProxied === 'true';
            
            editRecord(recordId, recordType, recordName, recordContent, recordProxied);
        } else if (target.classList.contains('btn-delete')) {
            const recordId = target.dataset.recordId;
            const recordType = target.dataset.recordType;
            const recordName = target.dataset.recordName;
            const recordContent = target.dataset.recordContent;
            
            confirmDeleteRecord(recordId, recordType, recordName, recordContent);
        }
    });
}

// Display pagination controls for DNS records
function displayDNSPaginationControls(pagination, currentPage, currentSearch) {
    const paginationContainer = document.getElementById('dns-records-pagination');
    
    if (!paginationContainer) {
        console.warn('DNS pagination container not found');
        return;
    }
    
    const { page, per_page, total_count, total_pages } = pagination;
    
    if (total_pages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '<div class="pagination-info">';
    paginationHTML += `<span>Page ${page} of ${total_pages} (${total_count} records)</span>`;
    paginationHTML += '</div>';
    
    paginationHTML += '<div class="pagination-controls">';
    
    // Previous button
    if (page > 1) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDNSRecords('${getCurrentDomain()}', ${page - 1}, '${currentSearch}')">
            <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }
    
    // Page numbers
    const maxPageLinks = 5;
    let startPage = Math.max(1, page - Math.floor(maxPageLinks / 2));
    let endPage = Math.min(total_pages, startPage + maxPageLinks - 1);
    
    if (endPage - startPage + 1 < maxPageLinks) {
        startPage = Math.max(1, endPage - maxPageLinks + 1);
    }
    
    if (startPage > 1) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDNSRecords('${getCurrentDomain()}', 1, '${currentSearch}')">1</button>`;
        if (startPage > 2) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === page ? ' active' : '';
        paginationHTML += `<button class="btn btn-outline btn-sm${isActive}" onclick="loadDNSRecords('${getCurrentDomain()}', ${i}, '${currentSearch}')">${i}</button>`;
    }
    
    if (endPage < total_pages) {
        if (endPage < total_pages - 1) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDNSRecords('${getCurrentDomain()}', ${total_pages}, '${currentSearch}')">${total_pages}</button>`;
    }
    
    // Next button
    if (page < total_pages) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDNSRecords('${getCurrentDomain()}', ${page + 1}, '${currentSearch}')">
            Next <i class="fas fa-chevron-right"></i>
        </button>`;
    }
    
    paginationHTML += '</div>';
    
    paginationContainer.innerHTML = paginationHTML;
}

// Get current domain from URL or input
function getCurrentDomain() {
    const domainInput = document.getElementById('domain-name');
    if (domainInput) {
        return domainInput.value;
    }
    
    // Extract from URL path
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'dns' && pathParts[2]) {
        return pathParts[2];
    }
    
    return '';
}

// Setup bulk actions
function setupBulkActions() {
    const selectAllCheckbox = document.getElementById('select-all-records');
    const bulkDeleteBtn = document.getElementById('bulk-delete-records');
    
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.record-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateBulkActionsVisibility();
        });
    }
    
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', function(e) {
            // Prevent multiple clicks
            if (this.disabled) {
                return;
            }
            
            const selectedRecords = getSelectedRecords();
            if (selectedRecords.length === 0) {
                showNotification('Please select records to delete', 'error');
                return;
            }
            
            // Single confirmation dialog
            if (confirm(`Are you sure you want to delete ${selectedRecords.length} selected record(s)?`)) {
                // Disable button immediately to prevent double-click
                this.disabled = true;
                bulkDeleteRecords(selectedRecords);
            }
        });
    }
    
    // Add event listeners to individual checkboxes
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('record-checkbox')) {
            updateBulkActionsVisibility();
            updateSelectAllCheckbox();
        }
    });
}

// Get selected record IDs
function getSelectedRecords() {
    const checkboxes = document.querySelectorAll('.record-checkbox:checked');
    return Array.from(checkboxes).map(checkbox => checkbox.value);
}

// Update bulk actions visibility
function updateBulkActionsVisibility() {
    const selectedRecords = getSelectedRecords();
    const bulkDeleteBtn = document.getElementById('bulk-delete-records');
    
    if (bulkDeleteBtn) {
        if (selectedRecords.length > 0) {
            bulkDeleteBtn.style.display = 'inline-block';
            bulkDeleteBtn.textContent = `Delete ${selectedRecords.length} Selected`;
        } else {
            bulkDeleteBtn.style.display = 'none';
        }
    }
}

// Update select all checkbox state
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-records');
    const checkboxes = document.querySelectorAll('.record-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.record-checkbox:checked');
    
    if (selectAllCheckbox) {
        if (checkedCheckboxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checkedCheckboxes.length === checkboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.indeterminate = true;
            selectAllCheckbox.checked = false;
        }
    }
}

// Bulk delete records
function bulkDeleteRecords(recordIds) {
    const domain = getCurrentDomain();
    const bulkDeleteBtn = document.getElementById('bulk-delete-records');
    
    // Disable button and show loading state
    const originalText = bulkDeleteBtn.textContent;
    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = 'Deleting...';
    
    fetch(`/api/dns/${domain}/bulk`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            record_ids: recordIds
        }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Bulk delete response:', data);
        
        // Count actual successful deletions from results
        let actualSuccessCount = 0;
        let errorMessages = [];
        
        if (data.results) {
            data.results.forEach(result => {
                if (result.success) {
                    actualSuccessCount++;
                } else if (result.error && !result.error.includes('Record does not exist')) {
                    // Only show errors that are not "record doesn't exist"
                    errorMessages.push(`Record ${result.record_id}: ${result.error}`);
                    console.error('Record deletion error:', result);
                }
            });
        }
        
        // Always reload DNS records to refresh the UI
        loadDNSRecords(domain);
        
        if (actualSuccessCount > 0) {
            showNotification(`Successfully deleted ${actualSuccessCount} record(s)`, 'success');
        } else if (data.total_count > 0) {
            // Records might have been deleted already or don't exist
            showNotification(`Records processed (${data.total_count} selected)`, 'info');
        }
        
        // Show specific errors if any
        if (errorMessages.length > 0) {
            console.error('Deletion errors:', errorMessages);
            showNotification(`Some records had errors: ${errorMessages[0]}`, 'warning');
        }
    })
    .catch(error => {
        console.error('Bulk delete error:', error);
        showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
    })
    .finally(() => {
        // Re-enable button
        if (bulkDeleteBtn) {
            bulkDeleteBtn.disabled = false;
            bulkDeleteBtn.textContent = originalText;
            bulkDeleteBtn.style.display = 'none';
        }
        
        // Clear all selections
        clearAllSelections();
    });
}

// Clear all checkbox selections
function clearAllSelections() {
    const selectAllCheckbox = document.getElementById('select-all-records');
    const checkboxes = document.querySelectorAll('.record-checkbox');
    
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    updateBulkActionsVisibility();
}

// Setup search and filter functionality
function setupSearchAndFilters() {
    const searchInput = document.getElementById('search-records');
    const typeFilter = document.getElementById('type-filter');
    const proxiedFilter = document.getElementById('proxied-filter');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
        searchInput.addEventListener('keyup', function(e) {
            if (e.key === 'Escape') {
                searchInput.value = '';
                applyFilters();
            }
        });
    }
    
    if (typeFilter) {
        typeFilter.addEventListener('change', applyFilters);
    }
    
    if (proxiedFilter) {
        proxiedFilter.addEventListener('change', applyFilters);
    }
    
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            if (typeFilter) typeFilter.value = '';
            if (proxiedFilter) proxiedFilter.value = '';
            applyFilters();
        });
    }
    
    // Setup table sorting
    setupTableSorting();
}

// Apply search and filter logic
function applyFilters() {
    const searchTerm = document.getElementById('search-records')?.value.toLowerCase().trim() || '';
    const typeFilter = document.getElementById('type-filter')?.value || '';
    const proxiedFilter = document.getElementById('proxied-filter')?.value || '';
    
    filteredDNSRecords = allDNSRecords.filter(record => {
        // Search filter
        const matchesSearch = !searchTerm ||
            record.type.toLowerCase().includes(searchTerm) ||
            record.name.toLowerCase().includes(searchTerm) ||
            record.content.toLowerCase().includes(searchTerm);
        
        // Type filter
        const matchesType = !typeFilter || record.type === typeFilter;
        
        // Proxied filter
        const matchesProxied = !proxiedFilter ||
            (proxiedFilter === 'true' && record.proxied) ||
            (proxiedFilter === 'false' && !record.proxied);
        
        return matchesSearch && matchesType && matchesProxied;
    });
    
    // Reapply current sorting
    if (currentSortField) {
        sortRecords(currentSortField, currentSortDirection);
    }
    
    displayDNSRecords();
    updateRecordsCount();
}

// Setup table sorting functionality
function setupTableSorting() {
    const sortableHeaders = document.querySelectorAll('.records-table th.sortable');
    
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            
            // Toggle sort direction if clicking the same column
            if (currentSortField === sortField) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortField = sortField;
                currentSortDirection = 'asc';
            }
            
            // Update header classes
            sortableHeaders.forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            this.classList.add(`sorted-${currentSortDirection}`);
            
            sortRecords(sortField, currentSortDirection);
            displayDNSRecords();
        });
    });
}

// Sort records by field and direction
function sortRecords(field, direction) {
    filteredDNSRecords.sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';
        
        // Handle special cases
        if (field === 'proxied') {
            aVal = a[field] ? 'true' : 'false';
            bVal = b[field] ? 'true' : 'false';
        } else {
            aVal = aVal.toString().toLowerCase();
            bVal = bVal.toString().toLowerCase();
        }
        
        if (direction === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
}

// Update records count display
function updateRecordsCount() {
    const recordsCountEl = document.getElementById('records-count');
    const filteredCountEl = document.getElementById('filtered-count');
    
    if (recordsCountEl) {
        recordsCountEl.textContent = `Total: ${allDNSRecords.length} records`;
    }
    
    if (filteredCountEl) {
        if (filteredDNSRecords.length !== allDNSRecords.length) {
            filteredCountEl.textContent = `Showing: ${filteredDNSRecords.length} records`;
            filteredCountEl.classList.remove('hidden');
        } else {
            filteredCountEl.classList.add('hidden');
        }
    }
}

// Enhanced delete confirmation
function confirmDeleteRecord(recordId, recordType, recordName, recordContent) {
    const modal = document.getElementById('delete-record-modal');
    const detailsEl = document.getElementById('delete-record-details');
    const recordIdInput = document.getElementById('delete-record-id');
    
    if (modal && detailsEl && recordIdInput) {
        detailsEl.textContent = `${recordType} | ${recordName} | ${recordContent}`;
        recordIdInput.value = recordId;
        modal.classList.add('active');
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility function to escape JavaScript strings
function escapeJs(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\\/g, '\\\\')
               .replace(/'/g, "\\'")
               .replace(/"/g, '\\"')
               .replace(/\n/g, '\\n')
               .replace(/\r/g, '\\r')
               .replace(/\t/g, '\\t');
}

// Modal management functions
function closeModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.classList.remove('active');
    });
}

// Edit record function
function editRecord(recordId, recordType, recordName, recordContent, proxied) {
    const domain = document.getElementById('domain-name').value;
    
    // Fill edit form
    document.getElementById('edit-record-id').value = recordId;
    document.getElementById('edit-record-type').value = recordType;
    document.getElementById('edit-record-name').value = recordName;
    document.getElementById('edit-record-content').value = recordContent;
    document.getElementById('edit-record-proxied').checked = proxied;
    
    // Show edit modal
    document.getElementById('edit-record-modal').classList.add('active');
}

// Save edited record
function saveEditedRecord() {
    const domain = document.getElementById('domain-name').value;
    const recordId = document.getElementById('edit-record-id').value;
    const recordType = document.getElementById('edit-record-type').value;
    const recordName = document.getElementById('edit-record-name').value;
    let recordContent = document.getElementById('edit-record-content').value;
    const recordProxied = document.getElementById('edit-record-proxied').checked;
    
    // Validate inputs
    if (!recordType || !recordName || !recordContent) {
        showNotification('Please fill all required fields', 'error');
        return;
    }

    // Handle @ symbol in content field for the edit form
    if (recordContent === '@') {
        recordContent = domain;
    }
        
    // Disable save button and show loading state
    const saveBtn = document.getElementById('save-record');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    // Send update request to the API
    fetch(`/api/dns/${domain}/${recordId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            type: recordType,
            name: recordName,
            content: recordContent,
            proxied: recordProxied
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'Record updated successfully', 'success');
            closeModals();
            
            // Reload records to show the updated data
            loadDNSRecords(domain);
        } else {
            showNotification(`Error: ${data.message || 'Failed to update record'}`, 'error');
        }
    })
    .catch(error => {
        showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
    })
    .finally(() => {
        // Re-enable button
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    });
}

// Delete record function
function deleteRecord() {
    const domain = document.getElementById('domain-name').value;
    const recordId = document.getElementById('delete-record-id').value;
    
    // Disable delete button and show loading state
    const deleteBtn = document.getElementById('confirm-delete');
    const originalText = deleteBtn.textContent;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';
    
    // Send delete request to the API
    fetch(`/api/dns/${domain}/${recordId}`, {
        method: 'DELETE',
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'Record deleted successfully', 'success');
            closeModals();
            
            // Reload records to show the updated data
            loadDNSRecords(domain);
        } else {
            showNotification(`Error: ${data.message || 'Failed to delete record'}`, 'error');
        }
    })
    .catch(error => {
        showNotification(`Error: ${error.message || 'Something went wrong'}`, 'error');
    })
    .finally(() => {
        // Re-enable button
        deleteBtn.disabled = false;
        deleteBtn.textContent = originalText;
    });
}

// Display detailed results log
function displayResultsLog(results) {
    const resultsLog = document.getElementById('results-log');
    const resultsContent = document.getElementById('results-content');
    
    if (!resultsLog || !resultsContent) return;
    
    // Clear previous results
    resultsContent.innerHTML = '';
    
    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    // Add summary
    const summaryEl = document.createElement('div');
    summaryEl.className = 'result-summary';
    summaryEl.innerHTML = `<strong>Summary:</strong> ${successCount} operations succeeded, ${failCount} operations failed.`;
    resultsContent.appendChild(summaryEl);
    
    // Add separator
    const separator = document.createElement('hr');
    separator.style.margin = '10px 0';
    separator.style.border = '0';
    separator.style.borderTop = '1px solid #ddd';
    resultsContent.appendChild(separator);
    
    // Add individual result items
    results.forEach(result => {
        const resultItem = document.createElement('div');
        
        // Set appropriate class based on result type
        let className = 'result-item';
        let icon = '';
        
        if (!result.success) {
            className += ' error';
            icon = '<i class="fas fa-times-circle result-icon"></i>';
        } else if (result.typeChanged) {
            className += ' success updated type-changed';
            icon = '<i class="fas fa-exchange-alt result-icon"></i>';
        } else if (result.updated) {
            className += ' success updated';
            icon = '<i class="fas fa-sync-alt result-icon"></i>';
        } else {
            className += ' success created';
            icon = '<i class="fas fa-plus-circle result-icon"></i>';
        }
        
        resultItem.className = className;
        
        // Create content
        resultItem.innerHTML = `
            ${icon}
            <div>
                <strong>${result.line || ''}</strong>
                <div>${result.message || ''}</div>
                ${result.error ? `<div class="error-details">${result.error}</div>` : ''}
            </div>
        `;
        
        resultsContent.appendChild(resultItem);
    });
    
    // Show the results log
    resultsLog.classList.remove('hidden');
}

// Display pagination controls
function displayPaginationControls(pagination, currentPage, currentSearch) {
    const paginationContainer = document.getElementById('domains-pagination');
    
    // If pagination container doesn't exist, return early
    if (!paginationContainer) {
        console.warn('Pagination container not found');
        return;
    }
    
    const { page, per_page, total_count, total_pages } = pagination;
    
    if (total_pages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '<div class="pagination-info">';
    paginationHTML += `<span>Page ${page} of ${total_pages} (${total_count} domains)</span>`;
    paginationHTML += '</div>';
    
    paginationHTML += '<div class="pagination-controls">';
    
    // Previous button
    if (page > 1) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDomains(${page - 1}, '${currentSearch}')">
            <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }
    
    // Page numbers
    const maxPageLinks = 5;
    let startPage = Math.max(1, page - Math.floor(maxPageLinks / 2));
    let endPage = Math.min(total_pages, startPage + maxPageLinks - 1);
    
    if (endPage - startPage + 1 < maxPageLinks) {
        startPage = Math.max(1, endPage - maxPageLinks + 1);
    }
    
    if (startPage > 1) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDomains(1, '${currentSearch}')">1</button>`;
        if (startPage > 2) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const isActive = i === page ? ' active' : '';
        paginationHTML += `<button class="btn btn-outline btn-sm${isActive}" onclick="loadDomains(${i}, '${currentSearch}')">${i}</button>`;
    }
    
    if (endPage < total_pages) {
        if (endPage < total_pages - 1) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDomains(${total_pages}, '${currentSearch}')">${total_pages}</button>`;
    }
    
    // Next button
    if (page < total_pages) {
        paginationHTML += `<button class="btn btn-outline btn-sm" onclick="loadDomains(${page + 1}, '${currentSearch}')">
            Next <i class="fas fa-chevron-right"></i>
        </button>`;
    }
    
    paginationHTML += '</div>';
    
    paginationContainer.innerHTML = paginationHTML;
}

// Setup domain search with pagination
function setupDomainSearchWithPagination() {
    const searchInput = document.getElementById('search-domains');
    if (!searchInput) return;
    
    let searchTimeout;
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        
        // Clear previous timeout
        clearTimeout(searchTimeout);
        
        // Add a small delay to avoid too many API calls
        searchTimeout = setTimeout(() => {
            loadDomains(1, searchTerm, false);
        }, 300);
    });
}

// Helper function to simulate API calls (for UI demonstration)
function simulateApiCall(response, delay = 500) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(response), delay);
    });
}

// Utility function to show notifications
function showNotification(message, type = 'success') {
    // Create notification element
    const notificationEl = document.createElement('div');
    notificationEl.className = `notification ${type}`;
    notificationEl.textContent = message;
    
    // Find or create notifications container
    let notificationsContainer = document.getElementById('notifications');
    if (!notificationsContainer) {
        notificationsContainer = document.createElement('div');
        notificationsContainer.id = 'notifications';
        document.body.insertBefore(notificationsContainer, document.body.firstChild);
    }
    
    // Add to DOM
    notificationsContainer.appendChild(notificationEl);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notificationEl.classList.add('fade-out');
        setTimeout(() => {
            notificationsContainer.removeChild(notificationEl);
        }, 300);
    }, 5000);
}

// Manage Credentials Modal Functions
function openManageCredentialsModal() {
    const modal = document.getElementById('manage-credentials-modal');
    if (modal) {
        modal.classList.add('active');
        populateCredentialsList();
        setupManageCredentialsModal();
    }
}

function closeManageCredentialsModal() {
    const modal = document.getElementById('manage-credentials-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function populateCredentialsList() {
    const credentialsList = document.getElementById('saved-credentials-list');
    if (!credentialsList) return;
    
    const allCredentials = getAllStoredCredentials();
    
    if (allCredentials.length === 0) {
        credentialsList.innerHTML = '<div class="no-credentials">No saved credentials found</div>';
        return;
    }
    
    credentialsList.innerHTML = '';
    allCredentials.forEach((credential, index) => {
        const credentialItem = document.createElement('div');
        credentialItem.className = 'credential-item';
        
        const savedDate = new Date(credential.timestamp).toLocaleDateString();
        const expiryDate = new Date(credential.expiryTime).toLocaleDateString();
        
        credentialItem.innerHTML = `
            <div class="credential-info">
                <div class="credential-email">${escapeHtml(credential.email)}</div>
                <div class="credential-details">
                    <small>Saved: ${savedDate} | Expires: ${expiryDate}</small>
                </div>
            </div>
            <div class="credential-actions">
                <button class="btn btn-sm" onclick="loadCredentialToForm('${escapeHtml(credential.email)}')">
                    <i class="fas fa-edit"></i> Load
                </button>
                <button class="btn btn-outline btn-sm" onclick="deleteSavedCredential('${escapeHtml(credential.email)}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        
        credentialsList.appendChild(credentialItem);
    });
}

function setupManageCredentialsModal() {
    const closeBtn = document.getElementById('close-manage-credentials-modal');
    const closeModalBtn = document.getElementById('close-manage-modal');
    const clearAllBtn = document.getElementById('clear-all-credentials');
    
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeManageCredentialsModal);
        closeBtn.addEventListener('click', closeManageCredentialsModal);
    }
    
    if (closeModalBtn) {
        closeModalBtn.removeEventListener('click', closeManageCredentialsModal);
        closeModalBtn.addEventListener('click', closeManageCredentialsModal);
    }
    
    if (clearAllBtn) {
        clearAllBtn.removeEventListener('click', clearAllSavedCredentials);
        clearAllBtn.addEventListener('click', clearAllSavedCredentials);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('manage-credentials-modal');
    if (modal) {
        modal.removeEventListener('click', handleModalOutsideClick);
        modal.addEventListener('click', handleModalOutsideClick);
    }
}

function handleModalOutsideClick(e) {
    if (e.target === e.currentTarget) {
        closeManageCredentialsModal();
    }
}

function loadCredentialToForm(email) {
    loadAndFillCredentials(email);
    closeManageCredentialsModal();
    
    // Update the saved credentials select if it exists
    const savedCredentialsSelect = document.getElementById('saved-credentials-select');
    if (savedCredentialsSelect) {
        savedCredentialsSelect.value = email;
    }
    
    showNotification('Credentials loaded successfully!', 'success');
}

function deleteSavedCredential(email) {
    if (confirm(`Are you sure you want to delete the saved credentials for ${email}?`)) {
        clearCredentials(email);
        populateCredentialsList();
        
        // Update the main form if this was the selected credential
        const savedCredentialsSelect = document.getElementById('saved-credentials-select');
        if (savedCredentialsSelect && savedCredentialsSelect.value === email) {
            savedCredentialsSelect.value = '';
            clearCredentialForm();
        }
        
        // Update the saved credentials dropdown
        checkAndLoadStoredCredentials();
        
        showNotification(`Credentials for ${email} deleted successfully`, 'info');
    }
}

function clearAllSavedCredentials() {
    if (confirm('Are you sure you want to delete ALL saved credentials? This action cannot be undone.')) {
        clearCredentials();
        populateCredentialsList();
        closeManageCredentialsModal();
        
        // Reset the form and hide the saved credentials section
        clearCredentialForm();
        const savedCredentialsGroup = document.getElementById('saved-credentials-group');
        if (savedCredentialsGroup) {
            savedCredentialsGroup.style.display = 'none';
        }
        
        showNotification('All saved credentials cleared', 'info');
    }
}
