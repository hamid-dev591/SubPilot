/**
 * ==========================================================================
 * SUBPILOT - CORE APPLICATION LOGIC (SECURE EDITION)
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // STATE & CRYPTO MANAGEMENT
    // ==========================================
    const STORAGE_KEY = 'subpilot_data';
    
    let state = {
        subscriptions: [],
        settings: {
            currency: 'USD',
            language: 'en',
            logo: null
        }
    };

    let sessionCryptoKey = null;

    // ==========================================
    // DOM ELEMENTS
    // ==========================================
    const views = {
        landing: document.getElementById('view-landing'),
        dashboard: document.getElementById('view-dashboard'),
        settings: document.getElementById('view-settings'),
        auth: document.getElementById('view-auth')
    };

    const modalSubscription = document.getElementById('modal-subscription');
    const notificationContainer = document.getElementById('notification-container');
    const formSubscription = document.getElementById('subscription-form');
    const searchInput = document.getElementById('search-input');
    const filterCategory = document.getElementById('filter-category');
    const filterStatus = document.getElementById('filter-status');
    const sortBy = document.getElementById('sort-by');
    const settingCurrency = document.getElementById('setting-currency');

    // ==========================================
    // SECURITY & ENCRYPTION LAYER
    // ==========================================
    function bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToBuffer(base64) {
        const binary_string = window.atob(base64);
        const bytes = new Uint8Array(binary_string.length);
        for (let i = 0; i < binary_string.length; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
        );
    }

    async function encryptData(dataObject, key) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = enc.encode(JSON.stringify(dataObject));
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv }, key, encoded
        );
        
        return {
            iv: bufferToBase64(iv),
            ciphertext: bufferToBase64(ciphertext)
        };
    }

    async function decryptData(encryptedObj, key) {
        const iv = base64ToBuffer(encryptedObj.iv);
        const ciphertext = base64ToBuffer(encryptedObj.ciphertext);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv }, key, ciphertext
        );
        
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decrypted));
    }

    // ==========================================
    // DATA LAYER
    // ==========================================
    async function saveData() {
        if (!sessionCryptoKey) return;

        try {
            const encryptedPayload = await encryptData(state, sessionCryptoKey);
            const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            storedData.encrypted = encryptedPayload;
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
            renderDashboard();
        } catch (e) {
            console.error("Encryption error:", e);
            showNotification('Failed to save encrypted data.', 'error');
        }
    }

    // ==========================================
    // INITIALIZATION & AUTH FLOW
    // ==========================================
    function init() {
        setupEventListeners();
        
        const stored = localStorage.getItem(STORAGE_KEY);
        
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.salt && parsed.encrypted) {
                    showAuthScreen(false);
                } else {
                    setupNewPasswordScreen();
                }
            } catch (e) {
                setupNewPasswordScreen();
            }
        } else {
            setupNewPasswordScreen();
        }
        
        const yearEl = document.getElementById('current-year');
        if(yearEl) yearEl.textContent = new Date().getFullYear();
    }

    function showAuthScreen(isNew) {
        const authMessage = document.getElementById('auth-message');
        const btnAuth = document.getElementById('btn-auth-submit');
        const authError = document.getElementById('auth-error');
        if(authError) authError.classList.add('hidden');

        if (isNew) {
            if(authMessage) authMessage.textContent = "Create a Master Password to encrypt your data locally. DO NOT lose this password!";
            if(btnAuth) btnAuth.textContent = "Create Vault";
        } else {
            if(authMessage) authMessage.textContent = "Your data is encrypted. Enter your Master Password to unlock.";
            if(btnAuth) btnAuth.textContent = "Unlock Vault";
        }

        switchView('auth');
    }

    function setupNewPasswordScreen() {
        showAuthScreen(true);
    }

    // ==========================================
    // CORE LOGIC & MATH
    // ==========================================
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat(state.settings.language, {
            style: 'currency',
            currency: state.settings.currency
        }).format(amount);
    }

    function getNormalizedCosts(price, cycle) {
        let monthly = 0, yearly = 0;
        const p = parseFloat(price);

        switch (cycle) {
            case 'Weekly': yearly = p * 52; monthly = yearly / 12; break;
            case 'Monthly': monthly = p; yearly = p * 12; break;
            case 'Quarterly': yearly = p * 4; monthly = yearly / 12; break;
            case 'Semi-Annual': yearly = p * 2; monthly = yearly / 12; break;
            case 'Yearly': yearly = p; monthly = p / 12; break;
        }
        return { monthly, yearly };
    }

    function calculateNextBillingDate(currentDateStr, cycle) {
        const date = new Date(currentDateStr);
        switch (cycle) {
            case 'Weekly': date.setDate(date.getDate() + 7); break;
            case 'Monthly': date.setMonth(date.getMonth() + 1); break;
            case 'Quarterly': date.setMonth(date.getMonth() + 3); break;
            case 'Semi-Annual': date.setMonth(date.getMonth() + 6); break;
            case 'Yearly': date.setFullYear(date.getFullYear() + 1); break;
        }
        return date.toISOString().split('T')[0];
    }

    // ==========================================
    // RENDERERS
    // ==========================================
    function renderDashboard() {
        if (!views.dashboard || !views.dashboard.classList.contains('active')) return;

        let filteredSubs = [...state.subscriptions];
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const catFilter = filterCategory ? filterCategory.value : 'All';
        const statFilter = filterStatus ? filterStatus.value : 'All';

        filteredSubs = filteredSubs.filter(sub => {
            const matchesSearch = sub.name.toLowerCase().includes(searchTerm) || (sub.notes && sub.notes.toLowerCase().includes(searchTerm));
            const matchesCat = catFilter === 'All' || sub.category === catFilter;
            const matchesStat = statFilter === 'All' || sub.status === statFilter;
            return matchesSearch && matchesCat && matchesStat;
        });

        const sortVal = sortBy ? sortBy.value : 'date-asc';
        filteredSubs.sort((a, b) => {
            if (sortVal === 'date-asc') return new Date(a.nextPayment) - new Date(b.nextPayment);
            if (sortVal === 'date-desc') return new Date(b.nextPayment) - new Date(a.nextPayment);
            if (sortVal === 'price-desc') return b.price - a.price;
            if (sortVal === 'price-asc') return a.price - b.price;
            if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
            return 0;
        });

        renderTable(filteredSubs);
        renderWidgets();
        renderAnalytics();
        renderPaymentAlerts();
    }

    function renderTable(subs) {
        const tbody = document.getElementById('subscriptions-body');
        const emptyState = document.getElementById('empty-state');
        const table = document.getElementById('subscriptions-table');
        
        if(!tbody || !emptyState || !table) return;

        tbody.innerHTML = '';

        if (subs.length === 0) {
            emptyState.classList.remove('hidden');
            table.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        table.classList.remove('hidden');

        subs.forEach(sub => {
            const tr = document.createElement('tr');
            const isPaused = sub.status === 'Paused';
            const statusBadge = `<span class="badge ${isPaused ? 'badge-paused' : 'badge-active'}">${sub.status}</span>`;
            
            tr.innerHTML = `
                <td><strong>${sub.name}</strong></td>
                <td>${sub.category}</td>
                <td>${sub.cycle}</td>
                <td>${formatCurrency(sub.price)}</td>
                <td>${sub.nextPayment}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="action-btn btn-edit" data-id="${sub.id}">Edit</button>
                    <button class="action-btn btn-toggle" data-id="${sub.id}">${isPaused ? 'Resume' : 'Pause'}</button>
                    <button class="action-btn delete btn-delete" data-id="${sub.id}">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderWidgets() {
        let totalMonthly = 0, totalYearly = 0, activeCount = 0;

        state.subscriptions.forEach(sub => {
            if (sub.status === 'Active') {
                activeCount++;
                const costs = getNormalizedCosts(sub.price, sub.cycle);
                totalMonthly += costs.monthly;
                totalYearly += costs.yearly;
            }
        });

        const avgMonthly = activeCount > 0 ? (totalMonthly / activeCount) : 0;
        const elMonthly = document.getElementById('widget-monthly-cost');
        const elYearly = document.getElementById('widget-yearly-cost');
        const elActive = document.getElementById('widget-active-subs');
        const elAvg = document.getElementById('widget-avg-monthly');

        if(elMonthly) elMonthly.textContent = formatCurrency(totalMonthly);
        if(elYearly) elYearly.textContent = formatCurrency(totalYearly);
        if(elActive) elActive.textContent = activeCount;
        if(elAvg) elAvg.textContent = formatCurrency(avgMonthly);
    }

    function renderAnalytics() {
        const activeSubs = state.subscriptions.filter(s => s.status === 'Active');
        const elMax = document.getElementById('stat-max-sub');
        const elMin = document.getElementById('stat-min-sub');
        const elBreakdown = document.getElementById('category-breakdown-list');

        if(!elMax || !elMin || !elBreakdown) return;

        if (activeSubs.length === 0) {
            elMax.textContent = 'None';
            elMin.textContent = 'None';
            elBreakdown.innerHTML = '<p style="font-size: 0.875rem; color: var(--blue-500);">No data.</p>';
            return;
        }

        let maxSub = activeSubs[0], minSub = activeSubs[0];
        const categoryTotals = {};
        let grandTotalMonthly = 0;

        activeSubs.forEach(sub => {
            const costs = getNormalizedCosts(sub.price, sub.cycle);
            const maxCosts = getNormalizedCosts(maxSub.price, maxSub.cycle);
            const minCosts = getNormalizedCosts(minSub.price, minSub.cycle);
            
            if (costs.monthly > maxCosts.monthly) maxSub = sub;
            if (costs.monthly < minCosts.monthly) minSub = sub;

            if (!categoryTotals[sub.category]) categoryTotals[sub.category] = 0;
            categoryTotals[sub.category] += costs.monthly;
            grandTotalMonthly += costs.monthly;
        });

        elMax.textContent = `${maxSub.name} (${formatCurrency(getNormalizedCosts(maxSub.price, maxSub.cycle).monthly)}/mo)`;
        elMin.textContent = `${minSub.name} (${formatCurrency(getNormalizedCosts(minSub.price, minSub.cycle).monthly)}/mo)`;

        elBreakdown.innerHTML = '';
        Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]).forEach(cat => {
            const total = categoryTotals[cat];
            const percentage = grandTotalMonthly > 0 ? (total / grandTotalMonthly) * 100 : 0;
            const wrapper = document.createElement('div');
            wrapper.className = 'category-bar-wrapper';
            wrapper.innerHTML = `
                <div class="category-bar-header"><span>${cat}</span><span>${formatCurrency(total)}/mo</span></div>
                <div class="category-bar-bg"><div class="category-bar-fill" style="width: ${percentage}%"></div></div>
            `;
            elBreakdown.appendChild(wrapper);
        });
    }

    function renderPaymentAlerts() {
        const container = document.getElementById('payment-alerts-container');
        if(!container) return;
        container.innerHTML = '';
        
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const oneWeekFromNow = new Date(today); oneWeekFromNow.setDate(today.getDate() + 7);

        state.subscriptions.forEach(sub => {
            if (sub.status !== 'Active') return;

            const paymentDate = new Date(sub.nextPayment);
            paymentDate.setHours(0,0,0,0);
            const alert = document.createElement('div');

            if (paymentDate < today) {
                alert.className = 'payment-alert overdue';
                alert.innerHTML = `<div><strong>${sub.name}</strong> is overdue (${sub.nextPayment}).</div><button class="btn btn-primary btn-mark-paid" data-id="${sub.id}">Mark Paid</button>`;
                container.appendChild(alert);
            } else if (paymentDate.getTime() === today.getTime()) {
                alert.className = 'payment-alert';
                alert.innerHTML = `<div><strong>${sub.name}</strong> (${formatCurrency(sub.price)}) is due <strong>Today</strong>.</div><button class="btn btn-primary btn-mark-paid" data-id="${sub.id}">Mark Paid</button>`;
                container.appendChild(alert);
            } else if (paymentDate > today && paymentDate <= oneWeekFromNow) {
                alert.className = 'payment-alert';
                alert.innerHTML = `<div><strong>${sub.name}</strong> (${formatCurrency(sub.price)}) is due soon (${sub.nextPayment}).</div>`;
                container.appendChild(alert);
            }
        });
    }

    // ==========================================
    // ACTIONS & EVENT HANDLERS
    // ==========================================
    function setupEventListeners() {
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const target = e.target.getAttribute('data-target');
                if (target && target.startsWith('landing-')) {
                    e.preventDefault();
                    if (views.landing && !views.landing.classList.contains('active')) {
                        switchView('landing');
                    }
                    setTimeout(() => {
                        const section = document.getElementById(target);
                        if(section) section.scrollIntoView();
                    }, 10);
                }
            });
        });

        document.getElementById('nav-dashboard-btn')?.addEventListener('click', () => switchView('dashboard'));
        document.getElementById('hero-dashboard-btn')?.addEventListener('click', () => switchView('dashboard'));
        document.getElementById('pricing-dashboard-btn')?.addEventListener('click', () => switchView('dashboard'));
        document.getElementById('footer-dashboard-btn')?.addEventListener('click', (e) => { e.preventDefault(); switchView('dashboard'); });
        
        document.getElementById('btn-logout')?.addEventListener('click', () => {
            sessionCryptoKey = null; 
            state = { subscriptions: [], settings: { currency: 'USD', language: 'en', logo: null } }; 
            switchView('landing');
            showNotification('Vault locked successfully.', 'info');
        });

        document.getElementById('btn-open-settings')?.addEventListener('click', () => switchView('settings'));
        document.getElementById('btn-back-dashboard')?.addEventListener('click', () => switchView('dashboard'));

        const mobileBtn = document.getElementById('mobile-menu-btn');
        const navLinks = document.getElementById('nav-links');
        mobileBtn?.addEventListener('click', () => navLinks?.classList.toggle('show'));

        const authForm = document.getElementById('auth-form');
        if(authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const passwordEl = document.getElementById('auth-password');
                const password = passwordEl ? passwordEl.value : '';
                const errorEl = document.getElementById('auth-error');
                if(errorEl) errorEl.classList.add('hidden');

                const stored = localStorage.getItem(STORAGE_KEY);
                let parsed = stored ? JSON.parse(stored) : {};

                try {
                    if (parsed.salt && parsed.encrypted) {
                        const saltBuffer = base64ToBuffer(parsed.salt);
                        const key = await deriveKey(password, saltBuffer);
                        state = await decryptData(parsed.encrypted, key);
                        sessionCryptoKey = key;
                        
                        applySettings();
                        switchView('dashboard');
                        showNotification('Vault unlocked!', 'success');
                    } else {
                        const salt = crypto.getRandomValues(new Uint8Array(16));
                        const key = await deriveKey(password, salt);
                        sessionCryptoKey = key;
                        parsed.salt = bufferToBase64(salt);
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                        
                        await saveData();
                        applySettings();
                        switchView('dashboard');
                        showNotification('Vault created securely!', 'success');
                    }
                } catch (err) {
                    if(errorEl) {
                        errorEl.textContent = "Incorrect Password!";
                        errorEl.classList.remove('hidden');
                    }
                }
                if(passwordEl) passwordEl.value = '';
            });
        }

        document.getElementById('btn-open-add-modal')?.addEventListener('click', openAddModal);
        document.getElementById('empty-state-add-btn')?.addEventListener('click', openAddModal);
        document.querySelectorAll('.btn-close-modal').forEach(btn => btn.addEventListener('click', closeModal));

        if(formSubscription) formSubscription.addEventListener('submit', handleSubscriptionSubmit);

        if(searchInput) searchInput.addEventListener('input', renderDashboard);
        if(filterCategory) filterCategory.addEventListener('change', renderDashboard);
        if(filterStatus) filterStatus.addEventListener('change', renderDashboard);
        if(sortBy) sortBy.addEventListener('change', renderDashboard);
        
        document.getElementById('subscriptions-body')?.addEventListener('click', handleTableActions);
        
        document.getElementById('payment-alerts-container')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-mark-paid')) markAsPaid(e.target.getAttribute('data-id'));
        });
        
        document.getElementById('quick-add-grid')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-add-btn')) {
                openAddModalWithDefaults(e.target.getAttribute('data-service'), e.target.getAttribute('data-category'));
            }
        });

        if(settingCurrency) {
            settingCurrency.addEventListener('change', (e) => {
                state.settings.currency = e.target.value;
                saveData();
                showNotification('Currency updated.', 'success');
            });
        }

        const logoInput = document.getElementById('setting-logo');
        const btnRemoveLogo = document.getElementById('btn-remove-logo');
        
        if (logoInput) {
            logoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    state.settings.logo = event.target.result;
                    saveData();
                    applySettings();
                    showNotification('Logo updated!', 'success');
                };
                reader.readAsDataURL(file);
            });
        }
        
        if (btnRemoveLogo) {
            btnRemoveLogo.addEventListener('click', () => {
                state.settings.logo = null;
                if(logoInput) logoInput.value = '';
                saveData();
                applySettings();
                showNotification('Logo removed.', 'success');
            });
        }

        document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);
        document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
        document.getElementById('input-import-json')?.addEventListener('change', importJSON);
        document.getElementById('btn-reset-data')?.addEventListener('click', resetAllData);
    }

    function switchView(viewName) {
        if ((viewName === 'dashboard' || viewName === 'settings') && !sessionCryptoKey) {
            viewName = 'auth';
        }

        Object.values(views).forEach(v => {
            if(v) v.classList.add('hidden');
            if(v) v.classList.remove('active');
        });
        
        if(views[viewName]) {
            views[viewName].classList.remove('hidden');
            views[viewName].classList.add('active');
        }
        window.scrollTo(0, 0);

        if (viewName === 'dashboard') {
            renderDashboard();
        }
    }

    function applySettings() {
        if(settingCurrency) settingCurrency.value = state.settings.currency;
        
        const navBrand = document.querySelector('.nav-brand');
        const footerBrand = document.querySelector('.footer-brand');
        const btnRemoveLogo = document.getElementById('btn-remove-logo');
        
        if (state.settings.logo) {
            const imgHtml = `<img src="${state.settings.logo}" alt="Logo" style="max-height: 35px; display: block;">`;
            if(navBrand) navBrand.innerHTML = imgHtml;
            if(footerBrand) footerBrand.innerHTML = imgHtml;
            if(btnRemoveLogo) btnRemoveLogo.classList.remove('hidden');
        } else {
            if(navBrand) navBrand.innerHTML = `<span class="brand-text">SubPilot</span>`;
            if(footerBrand) footerBrand.innerHTML = "SubPilot";
            if(btnRemoveLogo) btnRemoveLogo.classList.add('hidden');
        }
    }

    function openAddModal() {
        if(formSubscription) formSubscription.reset();
        const subId = document.getElementById('sub-id');
        const modalTitle = document.getElementById('modal-title');
        const subDate = document.getElementById('sub-date');
        
        if(subId) subId.value = '';
        if(modalTitle) modalTitle.textContent = 'Add Subscription';
        if(subDate) subDate.value = new Date().toISOString().split('T')[0];
        
        if(modalSubscription) modalSubscription.classList.remove('hidden');
    }

    function openAddModalWithDefaults(name, category) {
        openAddModal();
        const subName = document.getElementById('sub-name');
        const subCat = document.getElementById('sub-category');
        if(subName) subName.value = name;
        if(subCat) subCat.value = category;
    }

    function closeModal() {
        if(modalSubscription) modalSubscription.classList.add('hidden');
    }

    function handleSubscriptionSubmit(e) {
        e.preventDefault();
        const idEl = document.getElementById('sub-id');
        const id = idEl ? idEl.value : '';
        
        const newSub = {
            id: id || generateId(),
            name: document.getElementById('sub-name').value.trim(),
            category: document.getElementById('sub-category').value,
            price: parseFloat(document.getElementById('sub-price').value),
            cycle: document.getElementById('sub-cycle').value,
            nextPayment: document.getElementById('sub-date').value,
            notes: document.getElementById('sub-notes').value.trim(),
            status: 'Active',
            createdAt: new Date().toISOString()
        };

        if (id) {
            const index = state.subscriptions.findIndex(s => s.id === id);
            if (index !== -1) {
                newSub.status = state.subscriptions[index].status;
                state.subscriptions[index] = newSub;
                showNotification('Subscription updated.', 'success');
            }
        } else {
            state.subscriptions.push(newSub);
            showNotification('Subscription added.', 'success');
        }
        saveData();
        closeModal();
    }

    function handleTableActions(e) {
        const id = e.target.getAttribute('data-id');
        if (!id) return;

        if (e.target.classList.contains('btn-delete')) {
            if (confirm('Delete this subscription?')) {
                state.subscriptions = state.subscriptions.filter(s => s.id !== id);
                saveData();
                showNotification('Deleted.', 'success');
            }
        } else if (e.target.classList.contains('btn-toggle')) {
            const sub = state.subscriptions.find(s => s.id === id);
            if (sub) {
                sub.status = sub.status === 'Active' ? 'Paused' : 'Active';
                saveData();
                showNotification(`${sub.status}.`, 'success');
            }
        } else if (e.target.classList.contains('btn-edit')) {
            const sub = state.subscriptions.find(s => s.id === id);
            if (sub) {
                document.getElementById('sub-id').value = sub.id;
                document.getElementById('sub-name').value = sub.name;
                document.getElementById('sub-category').value = sub.category;
                document.getElementById('sub-price').value = sub.price;
                document.getElementById('sub-cycle').value = sub.cycle;
                document.getElementById('sub-date').value = sub.nextPayment;
                document.getElementById('sub-notes').value = sub.notes || '';
                document.getElementById('modal-title').textContent = 'Edit Subscription';
                if(modalSubscription) modalSubscription.classList.remove('hidden');
            }
        }
    }

    function markAsPaid(id) {
        const sub = state.subscriptions.find(s => s.id === id);
        if (sub) {
            sub.nextPayment = calculateNextBillingDate(sub.nextPayment, sub.cycle);
            saveData();
            showNotification('Marked as paid.', 'success');
        }
    }

    function exportJSON() {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        triggerDownload(blob, `subpilot_backup_${new Date().toISOString().split('T')[0]}.json`);
    }

    function exportCSV() {
        if (state.subscriptions.length === 0) return showNotification('No data.', 'error');
        const headers = ['Name', 'Category', 'Price', 'Cycle', 'Next Payment', 'Status'];
        const csvRows = [headers.join(',')];
        state.subscriptions.forEach(sub => {
            csvRows.push([`"${sub.name}"`, `"${sub.category}"`, sub.price, `"${sub.cycle}"`, `"${sub.nextPayment}"`, `"${sub.status}"`].join(','));
        });
        triggerDownload(new Blob([csvRows.join('\n')], { type: 'text/csv' }), 'subpilot_export.csv');
    }

    function importJSON(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (parsed.subscriptions) {
                    state = parsed;
                    saveData();
                    applySettings();
                    showNotification('Restored!', 'success');
                }
            } catch (err) { showNotification('Invalid file.', 'error'); }
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    function resetAllData() {
        if (confirm('WARNING: Deletes everything locally forever! Sure?')) {
            localStorage.removeItem(STORAGE_KEY);
            sessionCryptoKey = null;
            state = { subscriptions: [], settings: { currency: 'USD', language: 'en', logo: null } };
            switchView('landing');
            showNotification('Reset complete.', 'success');
        }
    }

    function triggerDownload(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    function showNotification(message, type = 'info') {
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        if(notificationContainer) {
            notificationContainer.appendChild(notif);
            setTimeout(() => { if (notif.parentNode) notif.parentNode.removeChild(notif); }, 3000);
        }
    }

    init();
});

// --- كود الوضع الداكن ---
const darkModeBtn = document.getElementById('toggle-dark-mode');
if(darkModeBtn) {
    // التحقق مما إذا كان المستخدم قد اختار الوضع الداكن مسبقاً
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }

    darkModeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        // حفظ تفضيل المستخدم في المتصفح
        if(document.body.classList.contains('dark-theme')) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });
}

// --- كود الرسم البياني (Chart.js) ---
let myChart = null;

function renderChart() {
    const ctx = document.getElementById('expensesChart');
    if(!ctx) return;

    // تجميع المصاريف حسب الدورة (شهري أو سنوي) كأبسط مثال، يمكنك تعديلها لتكون حسب الفئة (Category)
    let monthlyTotal = 0;
    let yearlyTotal = 0;

    state.subscriptions.forEach(sub => {
        const price = parseFloat(sub.price) || 0;
        if(sub.cycle === 'Monthly') monthlyTotal += price;
        if(sub.cycle === 'Yearly') yearlyTotal += price;
    });

    // إذا كان هناك رسم سابق، نقوم بتدميره لتحديثه
    if(myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['شهري (Monthly)', 'سنوي (Yearly)'],
            datasets: [{
                data: [monthlyTotal, yearlyTotal],
                backgroundColor: ['#0056b3', '#66a3e0'], // ألوان SubPilot
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

