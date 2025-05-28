// Main JavaScript file for Cloudflare DNS Manager

// Credential storage configuration
const CREDENTIAL_STORAGE_KEY = 'cloudflare_dns_credentials';
const CREDENTIAL_EXPIRY_DAYS = 30;

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
        testBtn.className = 'btn btn-secondary';
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

// Main app initialization
function initApp() {
    // Setup form handlers
    setupAPIForm();
    setupDomainSelect();
    setupDNSForm();
    
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
            showNotification(`Error: ${error.message || 'Failed to load domains'}`, 'error');
            if (domainsList) {
                domainsList.innerHTML = `<p class="error">Error loading domains: ${error.message || 'Unknown error'}</p>`;
            }
        });
}

// DNS Form Setup
function setupDNSForm() {
    const dnsForm = document.getElementById('dns-form');
    if (!dnsForm) return;

    dnsForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const domain = document.getElementById('domain-name').value;
        const records = document.getElementById('dns-records').value;
        
        // Validate inputs
        if (!records) {
            showNotification('Please enter DNS records', 'error');
            return;
        }
        
        // Basic validation for record format
        const recordLines = records.split('\n').filter(line => line.trim() !== '');
        let hasErrors = false;
        
        recordLines.forEach(line => {
            const parts = line.split('|');
            if (parts.length !== 3) {
                showNotification(`Invalid record format: ${line}. Use TYPE|NAME|CONTENT format.`, 'error');
                hasErrors = true;
            } else {
                const type = parts[0].trim().toUpperCase();
                const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"];
                if (!validTypes.includes(type)) {
                    showNotification(`Invalid record type: ${type}. Supported types: ${validTypes.join(', ')}`, 'error');
                    hasErrors = true;
                }
                
                // Special validation for MX records, which require priority
                if (type === 'MX') {
                    const content = parts[2].trim();
                    if (!content.includes(' ')) {
                        showNotification(`MX record content must include priority (e.g., '10 mail.example.com')`, 'error');
                        hasErrors = true;
                    }
                }
            }
        });
        
        if (hasErrors) return;
        
        // Disable form and show loading state
        const submitBtn = dnsForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating DNS...';
        
        // Send update request
        fetch(`/api/dns/${domain}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ records }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('DNS records updated successfully!', 'success');
                
                // Display results
                const results = data.results || [];
                const successCount = results.filter(r => r.success).length;
                const failCount = results.filter(r => !r.success).length;
                
                let resultMessage = `Successfully processed ${successCount} records.`;
                if (failCount > 0) {
                    resultMessage += ` ${failCount} records failed.`;
                }
                
                showNotification(resultMessage, 'success');
                
                // Reload DNS records
                // Display detailed results in the log section
                displayResultsLog(results);
                
                // Reload DNS records
                setTimeout(() => {
                    loadDNSRecords(domain);
                }, 1000);
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
// DNS Records Management
let dnsRecords = []; // Global store of DNS records for the current domain

function loadDNSRecords(domain) {
    const recordsTable = document.getElementById('dns-records-table');
    if (!recordsTable) return;
    
    const tbody = recordsTable.querySelector('tbody') || recordsTable;
    
    // Show loading state
    tbody.innerHTML = '<tr><td colspan="5">Loading DNS records...</td></tr>';
    
    // Fetch DNS records
    fetch(`/api/dns/${domain}`)
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Failed to load DNS records');
            }
            
            dnsRecords = data.data || []; // Store records globally
            
            if (dnsRecords.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No DNS records found for this domain.</td></tr>';
            } else {
                tbody.innerHTML = '';
                dnsRecords.forEach(record => {
                    const row = document.createElement('tr');
                    row.dataset.id = record.id; // Store record ID in row for reference
                    
                    // Format the name to show subdomain or @
                    let displayName = record.name;
                    if (displayName === domain) {
                        displayName = '@';
                    } else if (displayName.endsWith(`.${domain}`)) {
                        displayName = displayName.replace(`.${domain}`, '');
                    }
                    
                    row.innerHTML = `
                        <td>${record.type}</td>
                        <td>${displayName}</td>
                        <td>${record.content}</td>
                        <td>${record.proxied ? 'Yes' : 'No'}</td>
                        <td class="record-actions">
                            <button class="edit-record btn-modern" title="Edit Record">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="delete-record btn-modern" title="Delete Record">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    `;
                    
                    // Add event listeners to buttons
                    const editButton = row.querySelector('.edit-record');
                    const deleteButton = row.querySelector('.delete-record');
                    
                    editButton.addEventListener('click', () => openEditModal(record.id, domain));
                    deleteButton.addEventListener('click', () => openDeleteModal(record.id, domain));
                    
                    tbody.appendChild(row);
                });
            }
        })
        .catch(error => {
            showNotification(`Error: ${error.message || 'Failed to load DNS records'}`, 'error');
            tbody.innerHTML = `<tr><td colspan="5" class="error">Error loading DNS records: ${error.message || 'Unknown error'}</td></tr>`;
        });
}

// Refresh records button
document.addEventListener('DOMContentLoaded', function() {
    const refreshButton = document.getElementById('refresh-records');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            const domainName = document.getElementById('domain-name').value;
            loadDNSRecords(domainName);
        });
    }
});

// Modal handling functions
function openEditModal(recordId, domain) {
    // Find the record from our global store
    const record = dnsRecords.find(r => r.id === recordId);
    if (!record) {
        showNotification('Record not found', 'error');
        return;
    }
    
    // Format the name to show subdomain or @
    let displayName = record.name;
    if (displayName === domain) {
        displayName = '@';
    } else if (displayName.endsWith(`.${domain}`)) {
        displayName = displayName.replace(`.${domain}`, '');
    }
    
    // Populate form fields
    document.getElementById('edit-record-id').value = record.id;
    document.getElementById('edit-record-type').value = record.type;
    document.getElementById('edit-record-name').value = displayName;
    document.getElementById('edit-record-content').value = record.content;
    document.getElementById('edit-record-proxied').checked = record.proxied;
    
    // Update the content help text based on the record type
    updateContentHelpText(record.type);
    
    // Show modal
    document.getElementById('edit-record-modal').classList.add('active');
}

// Update the help text based on the selected record type
function updateContentHelpText(recordType) {
    const helpTextElement = document.querySelector('#edit-record-content + .help-text');
    if (!helpTextElement) return;
    
    let helpText = '';
    switch(recordType) {
        case 'A':
            helpText = 'Enter an IPv4 address (e.g., 192.0.2.1). You can use @ to use the root domain\'s IP.';
            break;
        case 'AAAA':
            helpText = 'Enter an IPv6 address (e.g., 2001:db8::1)';
            break;
        case 'CNAME':
            helpText = 'Enter a domain name (e.g., example.com). You can use @ to represent the root domain.';
            break;
        case 'MX':
            helpText = 'Enter priority and mail server (e.g., 10 mail.example.com)';
            break;
        case 'TXT':
            helpText = 'Enter text content (e.g., v=spf1 include:_spf.example.com ~all)';
            break;
        case 'NS':
            helpText = 'Enter nameserver domain (e.g., ns1.example.com)';
            break;
        case 'SRV':
            helpText = 'Enter priority weight port target (e.g., 10 5 5060 sip.example.com)';
            break;
        case 'CAA':
            helpText = 'Enter flags tag value (e.g., 0 issue "letsencrypt.org")';
            break;
        case 'PTR':
            helpText = 'Enter domain name for reverse DNS (e.g., example.com)';
            break;
        default:
            helpText = 'Enter content appropriate for this record type.';
    }
    
    helpTextElement.textContent = helpText;
}

function openDeleteModal(recordId, domain) {
    // Find the record
    const record = dnsRecords.find(r => r.id === recordId);
    if (!record) {
        showNotification('Record not found', 'error');
        return;
    }
    
    // Format the name to show subdomain or @
    let displayName = record.name;
    if (displayName === domain) {
        displayName = '@';
    } else if (displayName.endsWith(`.${domain}`)) {
        displayName = displayName.replace(`.${domain}`, '');
    }
    
    // Set the record ID and details
    document.getElementById('delete-record-id').value = record.id;
    document.getElementById('delete-record-details').textContent = 
        `${record.type} record: ${displayName} → ${record.content}`;
    
    // Show modal
    document.getElementById('delete-record-modal').classList.add('active');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Set up modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Edit modal
    const closeEditBtn = document.getElementById('close-edit-modal');
    const cancelEditBtn = document.getElementById('cancel-edit');
    const saveRecordBtn = document.getElementById('save-record');
    
    if (closeEditBtn) closeEditBtn.addEventListener('click', closeModals);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeModals);
    if (saveRecordBtn) saveRecordBtn.addEventListener('click', saveRecord);
    
    // Add event listener for record type changes to update help text
    const typeSelect = document.getElementById('edit-record-type');
    if (typeSelect) {
        typeSelect.addEventListener('change', function() {
            updateContentHelpText(this.value);
        });
    }
    
    // Delete modal
    const closeDeleteBtn = document.getElementById('close-delete-modal');
    const cancelDeleteBtn = document.getElementById('cancel-delete');
    const confirmDeleteBtn = document.getElementById('confirm-delete');
    
    if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeModals);
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeModals);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', deleteRecord);
});

// Save record function
function saveRecord() {
    const domain = document.getElementById('domain-name').value;
    const recordId = document.getElementById('edit-record-id').value;
    const recordType = document.getElementById('edit-record-type').value;
    let recordName = document.getElementById('edit-record-name').value.trim();
    const recordContent = document.getElementById('edit-record-content').value.trim();
    const recordProxied = document.getElementById('edit-record-proxied').checked;
    
    // Validate inputs
    if (!recordName || !recordContent) {
        showNotification('All fields are required', 'error');
        return;
    }
    
// Format name correctly
if (recordName === '@') {
    recordName = domain;
} else if (!recordName.includes(domain)) {
    recordName = `${recordName}.${domain}`;
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
