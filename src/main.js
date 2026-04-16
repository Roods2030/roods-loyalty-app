/**
 * ROODS - Programa Cavernícolas Frecuentes
 * Main Business Logic & State Management - Consolidated Phase 3
 * Version: 1.8.1 - Updated with prominent confirmations and registration flow fixes.
 */
console.log("ROODS Loyalty App v1.8.1 Loaded - Confirmations Active");

// --- Constants ---
const STORAGE_KEY = 'loyaltyCustomers';
const USED_FOLIOS_KEY = 'usedFolios';

// --- State ---
let customers = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let usedFolios = JSON.parse(localStorage.getItem(USED_FOLIOS_KEY)) || [];
let currentCustomer = null;
let html5QrCode = null;

// --- Advanced State ---
const WA_TEMPLATES_KEY = 'roods_wa_templates';
const CLOUD_CONFIG_KEY = 'roods_cloud_config';

const defaultTemplates = {
    welcome: "¡Bienvenido Cavernícola {nombre}! 🥩\n\nAquí tienes tu Tarjeta Digital de ROODS.\nCódigo Cliente: {id}",
    stamp: "¡Gracias por tu visita {nombre}! 🥩\n\nNuevo sello acumulado.\nTarjeta: {sellos}/8\n¡Falta poco!",
    reward: "¡CERTIFICADO DE REGALO! 🎁\n\nCavernícola {nombre}, ¡ganaste una BEBIDA GRATIS! 🧋\n\nFolio: {folio}"
};

let waTemplates = JSON.parse(localStorage.getItem(WA_TEMPLATES_KEY)) || defaultTemplates;
// Migrating cloud config to include Supabase credentials
let cloudConfig = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)) || { url: '', key: '', autoSync: true };
let supabaseClient = null;

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    if (cloudConfig.url && cloudConfig.key && window.supabase) {
        try {
            if (!cloudConfig.url.startsWith('http')) {
                alert('🚨 Error: La URL de Supabase debe empezar con https://');
                return null;
            }
            supabaseClient = window.supabase.createClient(cloudConfig.url, cloudConfig.key);
            return supabaseClient;
        } catch (err) {
            alert('🚨 Error al conectar con Supabase: ' + err.message);
            return null;
        }
    }
    return null;
}

// --- DOM References ---
const app = {
    sections: document.querySelectorAll('.section'),
    modals: document.querySelectorAll('.modal'),
    notif: document.getElementById('notification'),

    // Forms
    regForm: document.getElementById('registerForm'),
    editForm: document.getElementById('editForm'),

    // Registration Birthday Inputs
    regBdayDay: document.getElementById('regBdayDay'),
    regBdayMonth: document.getElementById('regBdayMonth'),
    regBdayYear: document.getElementById('regBdayYear'),

    // Search
    phoneSearch: document.getElementById('searchClient'),
    advSearchBtn: document.getElementById('advancedSearchBtn'),
    advSearchModal: document.getElementById('advancedSearchModal'),
    execAdvSearch: document.getElementById('execAdvSearch'),
    advResults: document.getElementById('advSearchResults'),

    // Stamp View
    clientDetails: document.getElementById('clientDetails'),
    progressBar: document.getElementById('progressBar'),
    stampCount: document.getElementById('stampCount'),
    stampsGrid: document.getElementById('stampsGrid'),
    addStampBtn: document.getElementById('addStampBtn'),
    rewardBanner: document.getElementById('rewardBanner'),
    folioCode: document.getElementById('folioCode'),

    // Management
    clientsList: document.getElementById('clientsList'),
    filterClients: document.getElementById('filterClients'),
    importCsv: document.getElementById('importCsv'),

    // New Lists
    rewardsList: document.getElementById('rewardsList'),
    birthdaysList: document.getElementById('birthdaysList'),
    todayDateLabel: document.getElementById('todayDateLabel'),

    // QR
    waText: document.getElementById('waText')
};

// --- Initialization ---
function initApp() {
    console.log("ROODS: Initializing App Logic...");
    try {
        initNavigation();
        initSearchEvents();
        initManagementEvents();
        initModals();
        initAdvancedFeatures();
        initFormListeners(); // New: wrap top-level listeners

        // Auto-Pull on Startup
        if (cloudConfig.autoSync && cloudConfig.url) {
            pullFromCloud(true); // silent pull
        }

        // Background Polling (Every 2 minutes)
        setInterval(() => {
            if (cloudConfig.autoSync && cloudConfig.url) {
                pullFromCloud(true);
            }
        }, 120000);

        console.log("ROODS: App Ready 🚀");
    } catch (e) {
        console.error("ROODS: Initialization Error:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        sanitizeData();
        initApp();
    });
} else {
    sanitizeData();
    initApp();
}

function sanitizeData() {
    // Remove totally corrupted or ghost clients (no ID, no Name)
    const beforeCount = customers.length;
    customers = customers.filter(c => c && c.id && c.name && c.id.trim() !== '' && c.name.trim() !== '');
    
    // Fix broken rewards structures
    customers.forEach(c => {
        if (!c.rewards || !Array.isArray(c.rewards)) {
            c.rewards = [];
        }
    });
    
    if (customers.length !== beforeCount) {
        console.warn(`ROODS: Sanitized ${beforeCount - customers.length} corrupted client records.`);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    }
}

function initAdvancedFeatures() {
    // Settings Button (WA + Cloud)
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.onclick = () => {
            // Load WA templates
            document.getElementById('template_welcome').value = waTemplates.welcome;
            document.getElementById('template_stamp').value = waTemplates.stamp;
            document.getElementById('template_reward').value = waTemplates.reward;

            // Load Cloud config
            document.getElementById('cloudUrl').value = cloudConfig.url || '';
            document.getElementById('cloudKey').value = cloudConfig.key || '';
            document.getElementById('chkAutoSync').checked = cloudConfig.autoSync;

            document.getElementById('settingsModal').classList.remove('hidden');
        };
    }

    const btnSaveSettings = document.getElementById('saveSettings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = () => {
            // Save WA templates
            waTemplates.welcome = document.getElementById('template_welcome').value;
            waTemplates.stamp = document.getElementById('template_stamp').value;
            waTemplates.reward = document.getElementById('template_reward').value;
            localStorage.setItem(WA_TEMPLATES_KEY, JSON.stringify(waTemplates));

            // Save Cloud config
            const newUrl = document.getElementById('cloudUrl').value.trim();
            const newKey = document.getElementById('cloudKey').value.trim();
            if (newUrl !== cloudConfig.url || newKey !== cloudConfig.key) {
                supabaseClient = null; // force re-init
            }
            cloudConfig.url = newUrl;
            cloudConfig.key = newKey;
            cloudConfig.autoSync = document.getElementById('chkAutoSync').checked;
            localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cloudConfig));

            document.getElementById('settingsModal').classList.add('hidden');
            confirm('Ajustes guardados correctamente 💾');
        };
    }

    // Reset Local Data Button
    const btnBorrarDatos = document.getElementById('btnBorrarDatosLocales');
    if (btnBorrarDatos) {
        btnBorrarDatos.onclick = () => {
            if (confirm('⚠️ ATENCIÓN: Esto borrará TODOS los clientes y premios de este dispositivo. ¿Estás seguro?')) {
                if (confirm('¿Completamente seguro? Esta acción no se puede deshacer.')) {
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem(USED_FOLIOS_KEY);
                    alert('Datos locales borrados. La aplicación se recargará en blanco.');
                    location.reload();
                }
            }
        };
    }
}

function initNavigation() {
    document.querySelectorAll('.menu-card').forEach(card => {
        card.addEventListener('click', () => showSection(`${card.dataset.section}Section`));
    });

    document.querySelectorAll('.btn-back').forEach(btn => {
        btn.addEventListener('click', () => showSection('menuSection'));
    });
}

function showSection(id) {
    app.sections.forEach(s => s.classList.remove('active'));
    const section = document.getElementById(id);
    if (section) section.classList.add('active');

    if (id === 'manageSection') renderClients();
    if (id === 'rewardsSection') renderRewards();
    if (id === 'birthdaysSection') renderBirthdays();
}

function initModals() {
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.addEventListener('click', () => {
            app.modals.forEach(m => m.classList.add('hidden'));
            if (html5QrCode) {
                html5QrCode.stop().catch(e => console.log('Scanner already stopped'));
            }
        });
    });
}

function initFormListeners() {
    if (app.regForm) {
        app.regForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const day = app.regBdayDay.value.padStart(2, '0');
            const month = app.regBdayMonth.value;
            const year = app.regBdayYear.value || '2000'; // Default year if not provided

            const phoneNum = document.getElementById('regPhone').value.trim();
            const cleanPhone = phoneNum.replace(/\D/g, '');

            // CHECK FOR DUPLICATES
            const exists = customers.find(c => (c.phone || '').toString().replace(/\D/g, '') === cleanPhone);
            if (exists) {
                // IMPROVEMENT: Use confirm to ensure the user reads it
                confirm(`¡Atención! Este número de teléfono ya está registrado a nombre de: ${exists.name}`);
                return; // Stop registration
            }

            const client = {
                id: 'C' + Date.now(),
                name: document.getElementById('regName').value.trim(),
                bday: `${year}-${month}-${day}`, // Store as YYYY-MM-DD
                bday_day: day,
                bday_month: month,
                bday_year_optional: app.regBdayYear.value ? year : null,
                phone: document.getElementById('regPhone').value.trim(),
                stamps: 0,
                totalStamps: 0,
                regDate: new Date().toISOString(),
                lastPurchase: null,
                rewards: []
            };

            const regAddStamp = document.getElementById('regAddStamp');
            if (regAddStamp && regAddStamp.checked) {
                client.stamps = 1;
                client.totalStamps = 1;
                client.lastPurchase = new Date().toISOString();
            }

            customers.push(client);
            save();

            // IMPROVEMENT: Registration success message requiring confirmation
            confirm(`¡Cavernícola registrado con éxito! 🥩`);

            // Optional Welcome Message
            if (confirm("¿Deseas enviar mensaje de bienvenida por WhatsApp?")) {
                sendDigitalCard(client);
            }

            app.regForm.reset();
            showSection('menuSection');
        });
    }

    if (app.addStampBtn) {
        app.addStampBtn.addEventListener('click', () => {
            currentCustomer.stamps++;
            currentCustomer.totalStamps++;
            currentCustomer.lastPurchase = new Date().toISOString();
            save();
            updateUI();

            // IMPROVEMENT: Prominent confirmation
            confirm('¡Sello registrado con éxito! 🥩');

            // Check if a new reward was just completed
            if (currentCustomer.stamps > 0 && currentCustomer.stamps % 8 === 0) {
                const folio = currentCustomer.rewards[currentCustomer.rewards.length - 1].folio;
                if (confirm(`¡Tarjeta llena! 🎉 ¿Deseas enviar el certificado de regalo (${folio}) por WhatsApp?`)) {
                    sendReward(currentCustomer, folio);
                }
            } else {
                // Sello WhatsApp
                const progress = currentCustomer.stamps % 8;
                if (confirm(`Sello agregado (${progress}/8). ¿Deseas enviar el estatus actualizado por WhatsApp al cliente?`)) {
                    sendStampMsg(currentCustomer);
                }
            }
        });
    }

    const redeemBtn = document.getElementById('redeemBtn');
    if (redeemBtn) {
        redeemBtn.addEventListener('click', () => {
            const rIdx = currentCustomer.rewards.findIndex(r => !r.used);
            if (rIdx > -1) {
                const reward = currentCustomer.rewards[rIdx];
                reward.used = true;
                reward.usedDate = new Date().toISOString();
                usedFolios.push(reward.folio);
                localStorage.setItem(USED_FOLIOS_KEY, JSON.stringify(usedFolios));

                save();
                updateUI();
                showNotification('¡Premio canjeado! Folio registrado.');
            }
        });
    }
}

// --- Search Logic ---
function initSearchEvents() {
    // Phone Search - Optimized to prevent freezing
    let searchTimeout;
    app.phoneSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const val = e.target.value.replace(/\D/g, '');

        if (val.length >= 7) {
            searchTimeout = setTimeout(() => {
                const found = customers.find(c => (c.phone || '').toString().replace(/\D/g, '').includes(val));
                if (found) loadClient(found);
            }, 300);
        } else {
            app.clientDetails.classList.add('hidden');
        }
    });

    // Advanced Search
    app.advSearchBtn.addEventListener('click', () => app.advSearchModal.classList.remove('hidden'));

    app.execAdvSearch.addEventListener('click', () => {
        const nameVal = document.getElementById('advSearchName').value.toLowerCase();
        const bdayVal = document.getElementById('advSearchBday').value; // DD-MM

        const results = customers.filter(c => {
            const matchesName = c.name.toLowerCase().includes(nameVal);

            let matchesBday = true;
            if (bdayVal) {
                const [d, m] = bdayVal.split('-');
                if (d && m) {
                    // Try to match against stored day/month or parse from bday string
                    const cDay = c.bday_day || c.bday.split('-')[2];
                    const cMonth = c.bday_month || c.bday.split('-')[1];
                    matchesBday = (cDay === d.padStart(2, '0') && cMonth === m.padStart(2, '0'));
                }
            }

            return matchesName && matchesBday;
        });

        renderSearchResults(results);
    });
}

function renderSearchResults(results) {
    app.advResults.innerHTML = '';
    if (results.length === 0) {
        app.advResults.innerHTML = '<p class="text-center">No se encontraron clientes</p>';
        return;
    }
    results.forEach(c => {
        const item = document.createElement('div');
        item.className = 'client-item';
        item.innerHTML = `<div><h4>${c.name}</h4><p>${c.phone}</p></div><button class="btn-outline">Ver</button>`;
        item.querySelector('button').onclick = () => {
            loadClient(c);
            app.advSearchModal.classList.add('hidden');
        };
        app.advResults.appendChild(item);
    });
}

// --- Client Load & Stamps ---
window.loadClient = function (client) {
    currentCustomer = client;
    app.clientDetails.classList.remove('hidden');
    document.getElementById('clientName').textContent = client.name;

    // Format Display Birthday
    let displayBday = "";
    if (client.bday_day && client.bday_month) {
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        displayBday = `${parseInt(client.bday_day)} de ${months[parseInt(client.bday_month) - 1]}`;
    } else {
        const bDate = new Date(client.bday);
        displayBday = `${bDate.getUTCDate()}/${bDate.getUTCMonth() + 1}`;
    }

    document.getElementById('clientMeta').textContent = `Tel: ${client.phone} | Cumple: ${displayBday}`;

    // Add Client Stats
    const totalFilledCards = client.rewards.length;
    let lastVisitStr = "---";
    if (client.lastPurchase) {
        lastVisitStr = new Date(client.lastPurchase).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    document.getElementById('clientStats').textContent = `Tarjetas llenas: ${totalFilledCards} | Última visita: ${lastVisitStr}`;

    updateUI();
};

function updateUI() {
    const s = currentCustomer.stamps || 0;
    const totalRewardsReady = Math.floor(s / 8);
    const stampsInCurrentCard = s % 8;

    app.progressBar.style.width = `${(stampsInCurrentCard / 8) * 100}%`;
    app.stampCount.textContent = stampsInCurrentCard;

    renderStampGrid(stampsInCurrentCard);

    // Show Reward Banner if at least 1 ticket is full
    if (s >= 8) {
        // Auto-generate rewards if they haven't been generated for existing full cards
        const totalGenerated = currentCustomer.rewards.length;
        if (totalRewardsReady > totalGenerated) {
            for (let i = 0; i < (totalRewardsReady - totalGenerated); i++) {
                const folio = genFolio();
                currentCustomer.rewards.push({ folio, date: new Date().toISOString(), used: false });
            }
            save();
        }

        const pending = currentCustomer.rewards.filter(r => !r.used);
        if (pending.length > 0) {
            app.rewardBanner.classList.remove('hidden');
            app.folioCode.textContent = pending[0].folio;
            app.rewardBanner.querySelector('h3').textContent = `🎉 ¡${pending.length} RECOMPENSA(S) LISTA(S)! 🎉`;
        } else {
            app.rewardBanner.classList.add('hidden');
        }
    } else {
        app.rewardBanner.classList.add('hidden');
    }
    updateCooldown();
}

function renderStampGrid(count) {
    app.stampsGrid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div');
        slot.className = `stamp-slot ${i < count ? 'filled' : ''}`;
        slot.innerHTML = i < count ? '<span class="stamp-icon">🧋</span>' : i + 1;
        app.stampsGrid.appendChild(slot);
    }
}

function updateCooldown() {
    if (!currentCustomer.lastPurchase) {
        app.addStampBtn.disabled = false;
        app.addStampBtn.textContent = 'Agregar Sello 🧋';
        return;
    }
    const diff = (new Date() - new Date(currentCustomer.lastPurchase)) / 3600000;
    if (diff < 12) {
        app.addStampBtn.disabled = true;
        app.addStampBtn.textContent = `Espera ${Math.ceil(12 - diff)}h`;
    } else {
        app.addStampBtn.disabled = false;
        app.addStampBtn.textContent = 'Agregar Sello 🧋';
    }
}

// removed duplicate event listeners for addStampBtn and redeemBtn

// --- Management & Edit ---
function initManagementEvents() {
    app.filterClients.addEventListener('input', renderClients);

    app.editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        const cIdx = customers.findIndex(x => x.id === id);
        if (cIdx > -1) {
            customers[cIdx].name = document.getElementById('editName').value;
            customers[cIdx].phone = document.getElementById('editPhone').value;
            customers[cIdx].bday = document.getElementById('editBday').value;
            customers[cIdx].email = document.getElementById('editEmail').value;
            save();
            renderClients();
            document.getElementById('editClientModal').classList.add('hidden');
            showNotification('Datos actualizados');
        }
    });
}

function renderClients() {
    const filter = app.filterClients.value.toLowerCase();
    const filtered = customers.filter(c => {
        const n = String(c.name || '').toLowerCase();
        const p = String(c.phone || '').toLowerCase();
        return n.includes(filter) || p.includes(filter);
    });

    app.clientsList.innerHTML = filtered.length === 0 ? '<p class="text-center">No hay clientes</p>' : '';
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'client-item';
        item.innerHTML = `
            <div><h4>${c.name}</h4><p>${c.phone} | 🧋 ${c.stamps}/8</p></div>
            <div style="display:flex; gap:5px; align-items:center;">
                <button class="btn-outline" onclick="editClient('${c.id}')">✏️</button>
                <button class="btn-outline" onclick="loadClientStamps('${c.id}')">Ver</button>
                <button class="btn-delete-small" onclick="deleteClient('${c.id}')">🗑️</button>
            </div>
        `;
        app.clientsList.appendChild(item);
    });
}

window.loadClientStamps = (id) => {
    const c = customers.find(x => x.id === id);
    if (c) {
        showSection('stampsSection');
        window.loadClient(c);
    }
};

window.editClient = (id) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('editId').value = c.id;
    document.getElementById('editName').value = c.name;
    document.getElementById('editPhone').value = c.phone;
    document.getElementById('editBday').value = c.bday;
    document.getElementById('editEmail').value = c.email || '';
    document.getElementById('editClientModal').classList.remove('hidden');
};

window.deleteClient = (id) => {
    if (confirm('¿Estás seguro de borrar a este cliente?')) {
        customers = customers.filter(c => c.id !== id);
        save();
        renderClients();
        showNotification('Cliente eliminado');
    }
};

// --- Rewards Registry ---
function renderRewards() {
    app.rewardsList.innerHTML = '';
    const allRewards = [];

    customers.forEach(c => {
        c.rewards.forEach(r => {
            allRewards.push({ ...r, clientName: c.name, clientId: c.id });
        });
    });

    allRewards.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allRewards.length === 0) {
        app.rewardsList.innerHTML = '<p class="text-center">No hay premios registrados aún</p>';
        return;
    }

    allRewards.forEach(r => {
        const item = document.createElement('div');
        item.className = `reward-item ${r.used ? 'used' : ''}`;
        item.innerHTML = `
            <div class="reward-header">
                <div>
                    <h4>${r.clientName}</h4>
                    <p style="font-size:0.75rem; color:#666;">Folio: <strong>${r.folio}</strong></p>
                </div>
                <span class="status-tag ${r.used ? 'redeemed' : 'pending'}">${r.used ? 'CANJEADO' : 'PENDIENTE'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <p style="font-size:0.7rem;">Generado: ${new Date(r.date).toLocaleDateString()}</p>
                <button class="btn-outline" style="font-size:0.7rem; padding:4px 8px;" onclick="loadClientStamps('${r.clientId}')">Ver Cliente</button>
            </div>
        `;
        app.rewardsList.appendChild(item);
    });
}

// --- Birthday of the Day ---
function renderBirthdays() {
    const today = new Date();
    const todayDay = String(today.getDate()).padStart(2, '0');
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0');

    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    app.todayDateLabel.textContent = `Hoy es ${today.getDate()} de ${months[today.getMonth()]}`;

    const birthdayBoys = customers.filter(c => {
        const cDay = c.bday_day || (c.bday && c.bday.split('-')[2]);
        const cMonth = c.bday_month || (c.bday && c.bday.split('-')[1]);
        return String(cDay || '').padStart(2, '0') === todayDay && String(cMonth || '').padStart(2, '0') === todayMonth;
    });

    app.birthdaysList.innerHTML = '';
    if (birthdayBoys.length === 0) {
        app.birthdaysList.innerHTML = '<p class="text-center">No hay cumpleañeros para hoy</p>';
        return;
    }

    birthdayBoys.forEach(c => {
        const item = document.createElement('div');
        item.className = 'client-item';
        item.style.borderColor = 'var(--accent-color)';
        item.innerHTML = `
            <div>
                <h4>🎂 ${c.name}</h4>
                <p>${c.phone}</p>
            </div>
            <div style="display:flex; gap:5px;">
                <button class="btn-outline" onclick="sendBirthdayGreeting('${c.id}')">📱 WA</button>
                <button class="btn-outline" onclick="loadClientStamps('${c.id}')">Ver</button>
            </div>
        `;
        app.birthdaysList.appendChild(item);
    });
}

window.sendBirthdayGreeting = (id) => {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    const msg = `¡Feliz Cumpleaños ${c.name}! 🎂🥩\n\nEn ROODS queremos celebrar contigo. Te invitamos a pasar hoy por un obsequio especial.\n\n¡Te esperamos!`;
    window.open(`https://wa.me/${(c.phone || '').toString().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
};

// --- CSV Import (Migration) ---
app.importCsv.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        showNotification('⚠️ Error: Usa CSV (delimitado por comas).');
        app.importCsv.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const csvData = ev.target.result;
            const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
            if (lines.length < 2) throw new Error('Archivo vacío');

            const delimiter = lines[0].includes(';') ? ';' : ',';

            function parseCSVLine(line, d) {
                const parts = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"' && line[i + 1] === '"') { // Handle escaped quotes ""
                        current += '"';
                        i++;
                    } else if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === d && !inQuotes) {
                        parts.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                parts.push(current.trim());
                return parts;
            }

            const headers = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

            const mapping = {
                nombre: headers.findIndex(h => h.includes('nombre') || h.includes('name') || h.includes('cliente')),
                tele: headers.findIndex(h => h.includes('numero') || h.includes('num') || h.includes('telefono') || h.includes('tel') || h.includes('cel') || h.includes('phone') || h.includes('movil') || h.includes('wa')),
                cumple: headers.findIndex(h => h.includes('cumple') || h.includes('nacimiento') || h.includes('bday') || h.includes('fecha')),
                dia: headers.findIndex(h => h === 'dia' || h === 'day'),
                mes: headers.findIndex(h => h === 'mes' || h === 'month'),
                ano: headers.findIndex(h => h === 'año' || h === 'year' || h === 'ano'),
                lastPurchase: headers.findIndex(h => (h.includes('ultima') || h.includes('ultma')) && (h.includes('compra') || h.includes('visita') || h.includes('fehca') || h.includes('fecha'))),
                total: -1
            };

            // Hierarchical Total Search
            let tIdx = headers.findIndex(h => h.includes('stamps') || (h.includes('sello') && h.includes('acumulado')));
            if (tIdx === -1) tIdx = headers.findIndex(h => h.includes('sellos'));
            if (tIdx === -1) tIdx = headers.findIndex(h => h.includes('total') && h.includes('sello'));
            if (tIdx === -1) tIdx = headers.findIndex(h => h.includes('total') && !h.includes('compra') && !h.includes('paga'));
            mapping.total = tIdx;

            if (mapping.nombre === -1 || mapping.tele === -1) throw new Error('Columnas Nombre/Teléfono no detectadas');

            let count = 0;
            lines.slice(1).forEach(l => {
                const parts = parseCSVLine(l, delimiter);
                if (parts[mapping.nombre] && parts[mapping.tele]) {
                    let bdayFormatted = '2000-01-01';

                    if (mapping.dia !== -1 && mapping.mes !== -1) {
                        const d = parts[mapping.dia].trim().padStart(2, '0');
                        const m = parts[mapping.mes].trim().padStart(2, '0');
                        const y = (mapping.ano !== -1 && parts[mapping.ano]) ? parts[mapping.ano].trim() : '2000';
                        bdayFormatted = `${y}-${m}-${d}`;
                    } else if (mapping.cumple !== -1) {
                        bdayFormatted = formatBday(parts[mapping.cumple]);
                    }

                    const [y, m, d] = bdayFormatted.split('-');

                    let totalRaw = parts[mapping.total] || '0';
                    totalRaw = totalRaw.toString().split('.')[0].replace(/[^\d]/g, '');
                    const totalStamps = parseInt(totalRaw) || 0;

                    // IMPORT LOGIC: Historical stamps count towards redeemed rewards
                    const historicalRewardsCount = Math.floor(totalStamps / 8);
                    const currentStamps = totalStamps % 8;
                    const rewardsArr = [];

                    for (let i = 0; i < historicalRewardsCount; i++) {
                        rewardsArr.push({
                            folio: 'HIST-' + genFolio(),
                            date: new Date().toISOString(),
                            used: true,
                            usedDate: new Date().toISOString()
                        });
                    }

                    customers.push({
                        id: 'M' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase(),
                        name: parts[mapping.nombre].trim(),
                        phone: parts[mapping.tele].trim(),
                        bday: bdayFormatted,
                        bday_day: d,
                        bday_month: m,
                        bday_year_optional: (y !== '2000') ? y : null,
                        stamps: currentStamps,
                        totalStamps: totalStamps,
                        regDate: new Date().toISOString(),
                        lastPurchase: (mapping.lastPurchase !== -1 && parts[mapping.lastPurchase]) ? formatBday(parts[mapping.lastPurchase]) : null,
                        rewards: rewardsArr
                    });
                    count++;
                }
            });

            save();
            renderClients();
            showNotification(`¡${count} migrados! 🥩`);
            app.importCsv.value = '';
        } catch (err) {
            showNotification(`Error: ${err.message}`);
            app.importCsv.value = '';
        }
    };
    reader.readAsText(file);
});

function formatBday(val) {
    if (!val) return '2000-01-01';
    val = val.trim().replace(/\s+/g, '');

    // Split by common separators
    const parts = val.split(/[-/.]/);

    // Format: YYYY-MM-DD
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }

    // Format: DD-MM-YYYY or DD-MM-YY or MM-DD-YYYY
    if (parts.length === 3) {
        let d = parts[0];
        let m = parts[1];
        let y = parts[2];

        if (y.length === 2) y = '19' + y;
        if (y.length === 4) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }

    // Format: DD-MM or D-M
    if (parts.length === 2) {
        return `2000-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) { }

    return '2000-01-01';
}

// --- Messaging ---

function sendDigitalCard(c) {
    let msg = waTemplates.welcome || defaultTemplates.welcome;
    msg = msg.replace(/{nombre}/g, c.name).replace(/{id}/g, c.id);
    window.open(`https://wa.me/${(c.phone || '').toString().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendStampMsg(c) {
    let msg = waTemplates.stamp || defaultTemplates.stamp;
    msg = msg.replace(/{nombre}/g, c.name).replace(/{sellos}/g, c.stamps % 8 === 0 ? 8 : c.stamps % 8);
    window.open(`https://wa.me/${(c.phone || '').toString().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendReward(c, folio) {
    let msg = waTemplates.reward || defaultTemplates.reward;
    msg = msg.replace(/{nombre}/g, c.name).replace(/{folio}/g, folio);
    window.open(`https://wa.me/${(c.phone || '').toString().replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
}

// --- Cloud Sync Implementation ---
function setGlobalSyncSyncing() {
    const el = document.getElementById('globalSyncIndicator');
    if(el) { el.textContent = '☁️ Sincronizando...'; el.className = 'sync-indicator sync-active'; }
}
function setGlobalSyncSuccess() {
    const el = document.getElementById('globalSyncIndicator');
    if(el) { el.textContent = '☁️ Datos al día'; el.className = 'sync-indicator'; }
}
function setGlobalSyncError() {
    const el = document.getElementById('globalSyncIndicator');
    if(el) { el.textContent = '⚠️ Sin conexión'; el.className = 'sync-indicator sync-error'; }
}

async function pushToCloud(silent = false) {
    const sb = getSupabase();
    if (!sb) return silent ? null : alert('Aún no configuras los datos de Supabase en Ajustes (URL y API Key).');

    if (!silent) document.getElementById('syncStatus').textContent = 'Subiendo...';
    setGlobalSyncSyncing();
    try {
        const { error } = await sb.from('customers').upsert(customers);
        if (error) throw error;

        if (!silent) {
            showNotification('Sincronización enviada ☁️');
            document.getElementById('syncStatus').textContent = 'Última: ' + new Date().toLocaleTimeString();
        }
        setGlobalSyncSuccess();
    } catch (e) {
        console.error('Supabase Push Error:', e);
        alert('🚨 Error alojando a Supabase:\n' + e.message); // Explicit error display
        if (!silent) {
            document.getElementById('syncStatus').textContent = 'Error: ' + e.message;
            showNotification('⚠️ Error al subir a Supabase');
        }
        setGlobalSyncError();
    }
}

async function pullFromCloud(silent = false) {
    const sb = getSupabase();
    if (!sb) return silent ? null : alert('Aún no configuras los datos de Supabase en Ajustes.');

    if (!silent) document.getElementById('syncStatus').textContent = 'Bajando...';
    setGlobalSyncSyncing();
    try {
        const { data, error } = await sb.from('customers').select('*');
        if (error) throw error;
        
        if (data && Array.isArray(data) && data.length > 0) {
            let changesMade = false;

            data.forEach(cloudClient => {
                if (!cloudClient || !cloudClient.id || cloudClient.id.trim() === '') return;
                
                const parsedStamps = parseInt(cloudClient.stamps) || 0;
                const parsedTotalStamps = parseInt(cloudClient.totalStamps) || parseInt(cloudClient.totalStamps) || 0;
                
                const localClientIndex = customers.findIndex(c => c.id === cloudClient.id);
                
                if (localClientIndex > -1) {
                    if (parsedStamps > customers[localClientIndex].stamps || parsedTotalStamps > customers[localClientIndex].totalStamps) {
                         customers[localClientIndex].stamps = Math.max(customers[localClientIndex].stamps, parsedStamps);
                         // Handle casing difference since SQL might lower-case totalStamps
                         customers[localClientIndex].totalStamps = Math.max(customers[localClientIndex].totalStamps, parsedTotalStamps);
                         changesMade = true;
                    }
                } else {
                    cloudClient.rewards = Array.isArray(cloudClient.rewards) ? cloudClient.rewards : [];
                    cloudClient.stamps = parsedStamps;
                    cloudClient.totalStamps = parsedTotalStamps;
                    cloudClient.name = (cloudClient.name && cloudClient.name.trim() !== '') ? cloudClient.name : 'Cliente Anónimo (' + cloudClient.id + ')';
                    
                    customers.push(cloudClient);
                    changesMade = true;
                }
            });

            if (changesMade) {
               localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
               if (window.location.hash === '#manageSection') renderClients();
            }

            if (!silent) {
                showNotification('Datos descargados y actualizados ✅');
                document.getElementById('syncStatus').textContent = 'Base actualizada';
            }
        }
        setGlobalSyncSuccess();
    } catch (e) {
        console.error('Supabase Pull Error:', e);
        if (!silent) alert('Error al procesar datos: ' + e.message);
        setGlobalSyncError();
    }
}

// --- Utils ---
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    if (cloudConfig.autoSync && cloudConfig.url) {
        pushToCloud(true); // Silent push on change
    }
}
function genFolio() { return 'RD' + Math.random().toString(36).substr(2, 6).toUpperCase(); }
function showNotification(msg) {
    app.notif.textContent = msg;
    app.notif.classList.add('show', 'glass');
    app.notif.classList.remove('hidden');
    setTimeout(() => app.notif.classList.remove('show'), 3000);
}
