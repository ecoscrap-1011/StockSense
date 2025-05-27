// DOM Elements
const stockSymbolEl = document.getElementById('stock-symbol');
const exchangeRateEl = document.getElementById('exchange-rate');
const stockNameEl = document.getElementById('stock-name');
const currentPriceEl = document.getElementById('current-price');
const priceChangeEl = document.getElementById('price-change');
const openPriceEl = document.getElementById('open-price');
const highPriceEl = document.getElementById('high-price');
const lowPriceEl = document.getElementById('low-price');
const volumeEl = document.getElementById('volume');
const lastUpdatedEl = document.getElementById('last-updated');
const currentTimeEl = document.getElementById('current-time');
const refreshBtn = document.getElementById('refresh-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const stockSearchEl = document.getElementById('stock-search');
const searchResultsEl = document.getElementById('search-results');
const predictionForm = document.getElementById('prediction-form');
const predictedPriceEl = document.getElementById('predicted-price');
const timeButtons = document.querySelectorAll('.time-btn');

// Chart objects
let priceChart = null;
let volumeChart = null;

// Current stock and settings
let currentSymbol = stockSymbolEl.textContent.trim();
let currentPeriod = '1d';
let currentInterval = '1m';
let refreshInterval = null;
let isLoading = false;
function fetchExchangeRate() {
    fetch('/exchange_rate')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                exchangeRateEl.textContent = `₹${data.rate.toFixed(2)}`;
            } else {
                exchangeRateEl.textContent = 'N/A';
            }
        })
        .catch(() => {
            exchangeRateEl.textContent = 'N/A';
        });
}

// Initialize the application
function initApp() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    
    // Load initial stock data
    fetchStockData(currentSymbol, currentPeriod, currentInterval);
    fetchExchangeRate(); //exchange rate 
    
    // Set up auto-refresh (every 60 seconds)
    startAutoRefresh();
    
    // Set up event listeners
    setupEventListeners();
}

// Set up all event listeners
function setupEventListeners() {
    // Refresh button click
    refreshBtn.addEventListener('click', () => {
        if (!isLoading) {
            refreshData();
        }
    });
    
    // Time period buttons
    timeButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            timeButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update period and interval
            currentPeriod = button.dataset.period;
            currentInterval = button.dataset.interval;
            
            // Fetch new data
            fetchStockData(currentSymbol, currentPeriod, currentInterval);
        });
    });
    
    // Stock search
    stockSearchEl.addEventListener('input', debounce(handleSearch, 300));
    stockSearchEl.addEventListener('focus', () => {
        if (searchResultsEl.children.length > 0) {
            searchResultsEl.style.display = 'block';
        }
    });
    
    document.addEventListener('click', (e) => {
        if (e.target !== stockSearchEl && !searchResultsEl.contains(e.target)) {
            searchResultsEl.style.display = 'none';
        }
    });
    
    // Prediction form
    predictionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        generatePrediction();
    });
}

// Handle stock search
async function handleSearch() {
    const query = stockSearchEl.value.trim();
    if (query.length < 1) {
        searchResultsEl.style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        if (results.length === 0) {
            searchResultsEl.style.display = 'none';
            return;
        }
        
        // Clear previous results
        searchResultsEl.innerHTML = '';
        
        // Display results
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <span class="search-result-symbol">${result.symbol}</span>
                <span class="search-result-name">${result.name}</span>
            `;
            
            item.addEventListener('click', () => {
                currentSymbol = result.symbol;
                stockSymbolEl.textContent = result.symbol;
                stockNameEl.textContent = result.name;
                searchResultsEl.style.display = 'none';
                stockSearchEl.value = '';
                
                fetchStockData(currentSymbol, currentPeriod, currentInterval);
            });
            
            searchResultsEl.appendChild(item);
        });
        
        searchResultsEl.style.display = 'block';
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Fetch stock data from the API
async function fetchStockData(symbol, period, interval) {
    setLoading(true);
    
    try {
        const response = await fetch(`/stock_data/${symbol}?period=${period}&interval=${interval}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Update UI with new data
        updateStockData(data);
        
        // Auto-populate prediction form with current values
        populatePredictionForm(data.current);
        
    } catch (error) {
        console.error('Error fetching stock data:', error);
        showError('Failed to load stock data. Please try again.');
    } finally {
        setLoading(false);
    }
}

// Update the UI with stock data
function updateStockData(data) {
    const current = data.current;
    const historical = data.historical;
    
    // Update stock info
    stockNameEl.textContent = getStockName(current.symbol);
    currentPriceEl.textContent = `$${current.price.toFixed(2)}`;
    
    // Update price change with color
    const changeText = current.change >= 0 
        ? `+$${current.change.toFixed(2)} (+${current.change_percent.toFixed(2)}%)`
        : `-$${Math.abs(current.change).toFixed(2)} (${current.change_percent.toFixed(2)}%)`;
        
    priceChangeEl.textContent = changeText;
    
    if (current.change > 0) {
        priceChangeEl.className = 'positive';
    } else if (current.change < 0) {
        priceChangeEl.className = 'negative';
    } else {
        priceChangeEl.className = 'neutral';
    }
    
    // Update market data
    openPriceEl.textContent = `$${current.open.toFixed(2)}`;
    highPriceEl.textContent = `$${current.high.toFixed(2)}`;
    lowPriceEl.textContent = `$${current.low.toFixed(2)}`;
    volumeEl.textContent = formatNumber(current.volume);
    
    // Update last updated time
    lastUpdatedEl.textContent = current.timestamp;
    
    // Update charts
    updateCharts(historical);
    
    // Apply animations
    applyUpdateAnimations();
}

// Update price and volume charts
function updateCharts(data) {
    // Format data for Chart.js
    const labels = data.labels;
    const prices = data.prices;
    const volumes = data.volumes;
    
    // Determine price chart color based on price trend
    const priceColor = prices[prices.length - 1] >= prices[0] 
        ? 'rgba(16, 185, 129, 1)' 
        : 'rgba(239, 68, 68, 1)';
        
    const priceBackgroundColor = prices[prices.length - 1] >= prices[0] 
        ? 'rgba(16, 185, 129, 0.1)' 
        : 'rgba(239, 68, 68, 0.1)';
    
    // Create/update price chart
    if (priceChart) {
        priceChart.data.labels = labels;
        priceChart.data.datasets[0].data = prices;
        priceChart.data.datasets[0].borderColor = priceColor;
        priceChart.data.datasets[0].backgroundColor = priceBackgroundColor;
        priceChart.update();
    } else {
        const priceCtx = document.getElementById('price-chart').getContext('2d');
        priceChart = new Chart(priceCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Price',
                    data: prices,
                    borderColor: priceColor,
                    backgroundColor: priceBackgroundColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHoverBackgroundColor: priceColor,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `$${context.raw.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 8,
                            font: {
                                size: 10
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(229, 231, 235, 0.4)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Create/update volume chart
    if (volumeChart) {
        volumeChart.data.labels = labels;
        volumeChart.data.datasets[0].data = volumes;
        volumeChart.update();
    } else {
        const volumeCtx = document.getElementById('volume-chart').getContext('2d');
        volumeChart = new Chart(volumeCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume',
                    data: volumes,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return formatNumber(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        grid: {
                            color: 'rgba(229, 231, 235, 0.4)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCompactNumber(value);
                            }
                        }
                    }
                }
            }
        });
    }
}

// Format numbers with commas
function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

// Format numbers in compact form (e.g., 1.5M)
function formatCompactNumber(num) {
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        compactDisplay: 'short'
    }).format(num);
}

// Get stock name from symbol (simplified version)
function getStockName(symbol) {
    const stockNames = {
        'AAPL': 'Apple Inc.',
        'MSFT': 'Microsoft Corporation',
        'GOOGL': 'Alphabet Inc.',
        'AMZN': 'Amazon.com, Inc.',
        'META': 'Meta Platforms, Inc.',
        'TSLA': 'Tesla, Inc.',
        'NFLX': 'Netflix, Inc.',
        'NVDA': 'NVIDIA Corporation',
        'JPM': 'JPMorgan Chase & Co.',
        'V': 'Visa Inc.'
    };
    
    return stockNames[symbol] || symbol;
}

// Generate price prediction
async function generatePrediction() {
    const formData = new FormData(predictionForm);
    
    try {
        setLoading(true);
        
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            predictedPriceEl.textContent = `$${result.prediction.toFixed(2)}`;
            document.getElementById('prediction-result').classList.add('pulse');
            setTimeout(() => {
                document.getElementById('prediction-result').classList.remove('pulse');
            }, 500);
        } else {
            throw new Error(result.message || 'Prediction failed');
        }
    } catch (error) {
        console.error('Prediction error:', error);
        showError('Failed to generate prediction. Please try again.');
    } finally {
        setLoading(false);
    }
}

// Populate prediction form with current values
function populatePredictionForm(data) {
    document.getElementById('open').value = data.open;
    document.getElementById('high').value = data.high;
    document.getElementById('low').value = data.low;
    document.getElementById('volume').value = data.volume;
}

// Apply animations to updated elements
function applyUpdateAnimations() {
    currentPriceEl.classList.add('fade-in');
    priceChangeEl.classList.add('fade-in');
    
    setTimeout(() => {
        currentPriceEl.classList.remove('fade-in');
        priceChangeEl.classList.remove('fade-in');
    }, 300);
}

// Start auto-refresh
function startAutoRefresh() {
    // Clear any existing interval
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Set new interval (60 seconds)
    refreshInterval = setInterval(() => {
        if (!isLoading) {
            refreshData();
        }
    }, 60000);
}

// Refresh data manually
function refreshData() {
    refreshBtn.classList.add('spinning');
    fetchStockData(currentSymbol, currentPeriod, currentInterval)
        .finally(() => {
            setTimeout(() => {
                refreshBtn.classList.remove('spinning');
            }, 500);
        });
}

// Update current time display
function updateCurrentTime() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleTimeString();
}

// Set loading state
function setLoading(loading) {
    isLoading = loading;
    loadingOverlay.style.display = loading ? 'flex' : 'none';
}

// Show error message
function showError(message) {
    alert(message);
}

// Debounce function for search input
function debounce(func, delay) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);