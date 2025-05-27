from flask import Flask, render_template, request, jsonify
import numpy as np
import joblib
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
import requests

app = Flask(__name__, static_folder='static')

# Your OpenExchangeRates API keys
OPENEXCHANGE_APP_IDS = [
    '66d863547af743f9adec5934ecd5cd64',
    'dfb828d69fbd4142982558925a6ef21b',
    '7aa87ffdcdef473da08ec8',
    '4a363014b909486b8f49d967b810a6c3',
]

# Global cache for USD to INR rate
cached_rate = None
last_fetched = None

def get_usd_to_inr():
    global cached_rate, last_fetched
    now = datetime.utcnow()

    # If cached within last 30 minutes, return cached value
    if last_fetched and (now - last_fetched) < timedelta(minutes=30):
        return cached_rate

    # Try each app_id
    for app_id in OPENEXCHANGE_APP_IDS:
        url = f'https://openexchangerates.org/api/latest.json?app_id={app_id}'
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()

            if 'rates' in data and 'INR' in data['rates']:
                cached_rate = round(data['rates']['INR'], 2)
                last_fetched = now
                return cached_rate
            else:
                print(f"INR rate not found in response for app_id={app_id}")
        except requests.exceptions.RequestException as e:
            print(f"Exchange rate fetch error with app_id={app_id}: {e}")

    # If none worked
    print("All API keys failed or are invalid.")
    return None

def preprocess(open_price, high, low, volume):
    try:
        test_data = [[float(open_price), float(high), float(low), float(volume)]]
        trained_model = joblib.load('model.pkl')
        prediction = trained_model.predict(test_data)
        return float(prediction[0])
    except Exception as e:
        print(f"Prediction error: {e}")
        return None

def get_stock_data(symbol, period="1d", interval="1m"):
    try:
        stock = yf.Ticker(symbol)
        data = stock.history(period=period, interval=interval)
        
        if data.empty:
            return None
            
        current_data = {
            "symbol": symbol,
            "price": round(data['Close'].iloc[-1], 2),
            "change": round(data['Close'].iloc[-1] - data['Close'].iloc[0], 2),
            "change_percent": round(((data['Close'].iloc[-1] - data['Close'].iloc[0]) / data['Close'].iloc[0]) * 100, 2),
            "open": round(data['Open'].iloc[0], 2),
            "high": round(data['High'].max(), 2),
            "low": round(data['Low'].min(), 2),
            "volume": int(data['Volume'].sum()),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        historical_data = {
            "labels": [index.strftime("%H:%M") for index in data.index],
            "prices": data['Close'].tolist(),
            "volumes": data['Volume'].tolist()
        }
        
        return {"current": current_data, "historical": historical_data}
    except Exception as e:
        print(f"Error fetching stock data: {e}")
        return None

@app.route('/')
def index():
    default_stock = "AAPL"
    return render_template('index.html', symbol=default_stock)

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.form
        open_price = data.get('open')
        high = data.get('high')
        low = data.get('low')
        volume = data.get('volume')
        
        prediction = preprocess(open_price, high, low, volume)
        
        if prediction is not None:
            return jsonify({
                'success': True,
                'prediction': round(prediction, 2)
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to generate prediction'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        })

@app.route('/stock_data/<symbol>')
def stock_data(symbol):
    period = request.args.get('period', '1d')
    interval = request.args.get('interval', '1m')
    
    data = get_stock_data(symbol, period, interval)
    
    if data:
        return jsonify(data)
    else:
        return jsonify({"error": "Failed to fetch stock data"})

@app.route('/search', methods=['GET'])
def search():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    
    try:
        popular_stocks = {
            "AAPL": "Apple Inc.",
            "MSFT": "Microsoft Corporation",
            "GOOGL": "Alphabet Inc.",
            "AMZN": "Amazon.com, Inc.",
            "META": "Meta Platforms, Inc.",
            "TSLA": "Tesla, Inc.",
            "NFLX": "Netflix, Inc.",
            "NVDA": "NVIDIA Corporation",
            "JPM": "JPMorgan Chase & Co.",
            "V": "Visa Inc."
        }
        
        results = []
        for symbol, name in popular_stocks.items():
            if query.upper() in symbol or query.lower() in name.lower():
                results.append({"symbol": symbol, "name": name})
                
        return jsonify(results[:5])
    except Exception as e:
        return jsonify([])

@app.route('/exchange_rate')
def exchange_rate():
    rate = get_usd_to_inr()
    if rate:
        return jsonify({'success': True, 'rate': rate})
    else:
        return jsonify({'success': False, 'message': 'Failed to fetch exchange rate'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
