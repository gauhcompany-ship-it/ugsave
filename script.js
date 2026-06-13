const API_URL = 'http://localhost:5000/api'; // Update with your backend URL

// App State
let currentUserId = localStorage.getItem('userId');
let savingsData = null;

// DOM Elements
const setupScreen = document.getElementById('setupScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const appsScreen = document.getElementById('appsScreen');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    if (currentUserId) {
        loadSavingsData();
    } else {
        showSetup();
    }
});

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Start goal button
    document.getElementById('startGoalBtn').addEventListener('click', createGoal);
    
    // Payment button
    document.getElementById('payBtn').addEventListener('click', makePayment);
}

function switchTab(tab) {
    // Update active button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });
    
    // Show appropriate screen
    setupScreen.classList.add('hidden');
    dashboardScreen.classList.add('hidden');
    appsScreen.classList.add('hidden');
    
    if (tab === 'dashboard') {
        dashboardScreen.classList.remove('hidden');
        refreshDashboard();
    } else if (tab === 'apps') {
        appsScreen.classList.remove('hidden');
        loadAppsScreen();
    }
}

function showSetup() {
    setupScreen.classList.remove('hidden');
    dashboardScreen.classList.add('hidden');
    appsScreen.classList.add('hidden');
    document.querySelector('.tab-btn[data-tab="dashboard"]').classList.remove('active');
    document.querySelector('.tab-btn[data-tab="apps"]').classList.remove('active');
}

function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

async function createGoal() {
    const goalName = document.getElementById('goalName').value;
    const goalAmount = parseFloat(document.getElementById('goalAmount').value);
    
    if (!goalName || !goalAmount) {
        alert('Please fill all fields');
        return;
    }
    
    showLoading();
    
    try {
        const userId = `user_${Date.now()}`;
        const response = await fetch(`${API_URL}/savings/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, goalName, goalAmount })
        });
        
        if (response.ok) {
            localStorage.setItem('userId', userId);
            currentUserId = userId;
            await loadSavingsData();
            switchTab('dashboard');
        } else {
            throw new Error('Failed to create goal');
        }
    } catch (error) {
        alert('Error creating goal: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function loadSavingsData() {
    try {
        const response = await fetch(`${API_URL}/savings/${currentUserId}`);
        if (response.ok) {
            savingsData = await response.json();
            refreshDashboard();
        } else if (response.status === 404) {
            localStorage.removeItem('userId');
            currentUserId = null;
            showSetup();
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function refreshDashboard() {
    if (!savingsData) return;
    
    const progress = (savingsData.currentSavings / savingsData.goalAmount) * 100;
    const remaining = savingsData.goalAmount - savingsData.currentSavings;
    const isGoalMet = savingsData.goalMet;
    
    // Update UI
    document.getElementById('displayGoalName').textContent = savingsData.goalName;
    document.getElementById('currentSavings').textContent = `$${savingsData.currentSavings.toFixed(2)}`;
    document.getElementById('goalAmountDisplay').textContent = `$${savingsData.goalAmount.toFixed(2)}`;
    document.getElementById('progressBar').style.width = `${Math.min(progress, 100)}%`;
    document.getElementById('progressBar').textContent = `${progress.toFixed(1)}%`;
    document.getElementById('progressPercent').textContent = `${progress.toFixed(1)}% Complete`;
    
    if (!isGoalMet) {
        document.getElementById('remainingAmount').textContent = `$${remaining.toFixed(2)} remaining`;
        document.getElementById('paymentSection').classList.remove('hidden');
        document.getElementById('goalMetSection').classList.add('hidden');
    } else {
        document.getElementById('paymentSection').classList.add('hidden');
        document.getElementById('goalMetSection').classList.remove('hidden');
    }
    
    // Update transactions
    const transactionsList = document.getElementById('transactionsList');
    if (savingsData.transactions && savingsData.transactions.length > 0) {
        transactionsList.innerHTML = savingsData.transactions.slice().reverse().map(tx => `
            <div class="transaction-item">
                <span class="transaction-amount">+$${tx.amount}</span>
                <span class="transaction-date">${new Date(tx.date).toLocaleDateString()}</span>
            </div>
        `).join('');
    } else {
        transactionsList.innerHTML = '<p class="no-transactions">No transactions yet</p>';
    }
}

async function makePayment() {
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_URL}/savings/initialize-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, amount })
        });
        
        const data = await response.json();
        
        if (data.paymentLink) {
            // Open payment link in new window
            window.open(data.paymentLink, '_blank');
            
            // Poll for payment confirmation
            pollForPaymentConfirmation(data.reference);
        } else {
            throw new Error('No payment link received');
        }
    } catch (error) {
        alert('Error initiating payment: ' + error.message);
        hideLoading();
    }
}

function pollForPaymentConfirmation(reference) {
    let attempts = 0;
    const maxAttempts = 30;
    
    const interval = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`${API_URL}/savings/${currentUserId}`);
            const newData = await response.json();
            
            // Check if savings increased
            if (newData.currentSavings > savingsData.currentSavings) {
                clearInterval(interval);
                savingsData = newData;
                refreshDashboard();
                hideLoading();
                alert('Payment successful!');
                document.getElementById('paymentAmount').value = '';
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                hideLoading();
                alert('Payment verification timeout. Please check your transaction status.');
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 3000);
}

function loadAppsScreen() {
    const apps = [
        { name: 'YouTube', id: 'youtube', icon: '📺' },
        { name: 'Instagram', id: 'instagram', icon: '📸' },
        { name: 'Facebook', id: 'facebook', icon: '👍' },
        { name: 'TikTok', id: 'tiktok', icon: '🎵' },
        { name: 'Netflix', id: 'netflix', icon: '🎬' },
        { name: 'Spotify', id: 'spotify', icon: '🎵' }
    ];
    
    const appsGrid = document.getElementById('appsGrid');
    const unlockedApps = savingsData?.unlockedApps || [];
    
    appsGrid.innerHTML = apps.map(app => {
        const isUnlocked = unlockedApps.includes(app.id);
        return `
            <div class="app-card ${!isUnlocked ? 'locked' : ''}" 
                 onclick="${isUnlocked ? `alert('${app.name} is unlocked!')` : 'alert(\'Save more to unlock this app\')'}">
                <div class="app-icon">${app.icon}</div>
                <div class="app-name">${app.name}</div>
                ${!isUnlocked ? '<div class="lock-icon">🔒</div>' : ''}
            </div>
        `;
    }).join('');
}

// Refresh data periodically
setInterval(() => {
    if (currentUserId && savingsData && !savingsData.goalMet) {
        loadSavingsData();
    }
}, 10000);
