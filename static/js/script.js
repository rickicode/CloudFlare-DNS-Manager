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
const CREDENTIAL_STORAGE_KEY = 'cloudflare_dns_credentials';
const CREDENTIAL_EXPIRY_DAYS = 30;

// DNS Templates configuration
const DNS_TEMPLATES_STORAGE_KEY = 'cloudflare_dns_templates';
const DEFAULT_DNS_TEMPLATE = {
    name: 'Default Template',
    records: [
        'A|@|138.199.137.90|true',
        'CNAME|www|@|true',
        'CNAME|shop|@|true',
        'CNAME|buy|@|true'
    ]
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    initApp();
});

// Credential storage functions
function saveCredentials(email, apiKey) {
    const credentials = {
        email: email,
        apiKey: apiKey,
        timestamp: Date.now(),
        expiryTime: Date.now() + (CREDENTIAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    };
    
    try {
        localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
        return true;
    } catch (error) {
        console.error('Failed to save credentials:', error);
        return false;
    }
}

function loadCredentials() {
    try {
        const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
        if (!stored) return null;
        
        const credentials = JSON.parse(stored);
        
        // Check if credentials have expired
        if (Date.now() > credentials.expiryTime) {
            clearCredentials();
            return null;
        }
        
        return {
            email: credentials.email,
            apiKey: credentials.apiKey
        };
    } catch (error) {
        console.error('Failed to load credentials:', error);
        clearCredentials();
        return null;
    }
}

function clearCredentials() {
    try {
        localStorage.removeItem(CREDENTIAL_STORAGE_KEY);
    } catch (error) {
        console.error('Failed to clear credentials:', error);
    }
}

function hasStoredCredentials() {
    const credentials = loadCredentials();
    return credentials !== null;
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
    const credentials = loadCredentials();
    if (credentials) {
        // Auto-fill the form with stored credentials
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
        
        // Show "Test API Credential" button and hide/modify the original submit button
        showTestCredentialButton();
    }
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
        testBtn.innerHTML = '<i class="fas fa-check-circle"></i> Test API Credential';
        formActions.appendChild(testBtn);
        
        // Add event listener for test button
        testBtn.addEventListener('click', testStoredCredentials);
    }
    
    // Add "Clear Stored Credentials" button
    let clearBtn = formActions.querySelector('#clear-stored-credentials');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'clear-stored-credentials';
        clearBtn.className = 'btn btn-outline';
        clearBtn.innerHTML = '<i class="fas fa-trash"></i> Clear Stored Credentials';
        formActions.appendChild(clearBtn);
        
        // Add event listener for clear button
        clearBtn.addEventListener('click', function() {
            clearCredentials();
            // Reset form and buttons
            document.getElementById('email').value = '';
            document.getElementById('api-key').value = '';
            hideTestCredentialButton();
            showNotification('Stored credentials cleared', 'info');
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
    
    // Remove test and clear buttons
    const testBtn = formActions.querySelector('#test-stored-credentials');
    const clearBtn = formActions.querySelector('#clear-stored-credentials');
    if (testBtn) testBtn.remove();
    if (clearBtn) clearBtn.remove();
}

// Test stored credentials
function testStoredCredentials() {
    const credentials = loadCredentials();
    if (!credentials) {
        showNotification('No stored credentials found', 'error');
        return;
    }
    
    const testBtn = document.getElementById('test-stored-credentials');
    const originalText = testBtn.textContent;
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    // Send validation request with stored credentials
    fetch('/validate-api', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            email: credentials.email, 
            apiKey: credentials.apiKey 
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Stored credentials validated successfully!', 'success');
            setTimeout(() => {
                window.location.href = '/domains';
            }, 1000);
        } else {
            showNotification(`Error: ${data.message || 'Invalid stored credentials'}`, 'error');
            // Clear invalid credentials
            clearCredentials();
            hideTestCredentialButton();
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
    setupDNSTemplates();
    
    // Check if we're already on a specific page
    const path = window.location.pathname;
    if (path.startsWith('/dns/')) {
        // We're on the DNS management page for a specific domain
        const domain = path.replace('/dns/', '');
        loadDNSRecords(domain);
    } else if (path === '/domains') {
        // We're on the domains page
        loadDomains();
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

// Domain Selection Setup
function setupDomainSelect() {
    const domainSelect = document.getElementById('domain-select');
    if (!domainSelect) return;
    
    domainSelect.addEventListener('change', function() {
        const domain = this.value;
        if (domain) {
            window.location.href = `/dns/${domain}`;
        }
    });
}

// Load Domains
function loadDomains() {
    const domainsList = document.getElementById('domains-list');
    const domainSelect = document.getElementById('domain-select');
    
    if (!domainsList && !domainSelect) return;
    
    // Show loading state
    if (domainsList) {
        domainsList.innerHTML = '<p>Loading domains...</p>';
    }
    
    // Fetch domains
    fetch('/api/domains')
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Failed to load domains');
            }
            
            const domains = data.data || [];
            
            // Update domains list if it exists
            if (domainsList) {
                if (domains.length === 0) {
                    domainsList.innerHTML = '<p>No domains found in your account.</p>';
                } else {
                    domainsList.innerHTML = '';
                    domains.forEach(domain => {
                        const item = document.createElement('div');
                        item.className = 'domain-item';
                        item.innerHTML = `
                            <h3>${domain.name}</h3>
                            <p>Status: ${domain.status}</p>
                            <a href="/dns/${domain.name}" class="btn">Manage DNS</a>
                        `;
                        domainsList.appendChild(item);
                    });
                }
            }
            
            // Update domain select dropdown if it exists
            if (domainSelect) {
                domainSelect.innerHTML = '<option value="">Select a domain</option>';
                domains.forEach(domain => {
                    const option = document.createElement('option');
                    option.value = domain.name;
                    option.textContent = domain.name;
                    domainSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            const errorMsg = `Error loading domains: ${error.message}`;
            if (domainsList) {
                domainsList.innerHTML = `<p class="error">${errorMsg}</p>`;
            }
            showNotification(errorMsg, 'error');
        });
}

// DNS Form Setup
function setupDNSForm() {
    const dnsForm = document.getElementById('dns-form');
    if (!dnsForm) return;

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
                showNotification(data.message, 'success');
                
                // Display results if available
                if (data.results) {
                    displayResultsLog(data.results);
                }
                
                // Reload DNS records
                loadDNSRecords(domain);
            } else {
                showNotification(`Error: ${data.message || 'Failed to update DNS records'}`, 'error');
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
function loadDNSRecords(domain) {
    const recordsContainer = document.getElementById('dns-records-display');
    if (!recordsContainer) return;
    
    recordsContainer.innerHTML = '<p>Loading DNS records...</p>';
    
    fetch(`/api/dns/${domain}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayDNSRecords(data.data);
            } else {
                throw new Error(data.message || 'Failed to load DNS records');
            }
        })
        .catch(error => {
            recordsContainer.innerHTML = `<p class="error">Error loading DNS records: ${error.message}</p>`;
            showNotification(`Error loading DNS records: ${error.message}`, 'error');
        });
}

// Display DNS Records
function displayDNSRecords(records) {
    const container = document.getElementById('dns-records-display');
    if (!container) return;
    
    if (!records || records.length === 0) {
        container.innerHTML = '<p>No DNS records found for this domain.</p>';
        return;
    }
    
    let html = `
        <div class="records-header">
            <div class="record-type">Type</div>
            <div class="record-name">Name</div>
            <div class="record-content">Content</div>
            <div class="record-actions">Actions</div>
        </div>
    `;
    
    records.forEach(record => {
        const proxiedIcon = record.proxied ? '<i class="fas fa-shield-alt" title="Proxied"></i>' : '';
        html += `
            <div class="record-row">
                <div class="record-type">${record.type}</div>
                <div class="record-name">${record.name}</div>
                <div class="record-content">${record.content} ${proxiedIcon}</div>
                <div class="record-actions">
                    <button class="btn-icon" onclick="editRecord('${record.id}', '${record.type}', '${record.name}', '${record.content}', ${record.proxied})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteRecord('${record.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
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
    document.getElementById('edit-modal').classList.add('active');
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
