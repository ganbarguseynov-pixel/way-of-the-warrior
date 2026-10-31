from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# --- ПОИСК ЧЕРЕЗ ВИКИПЕДИЮ ---
@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    
    try:
        # Ищем статью в русской Википедии
        url = "https://ru.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "utf8": 1,
            "srlimit": 3
        }
        headers = {'User-Agent': 'SportApp/1.0 (contact@example.com)'}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        data = response.json()
        
        products = []
        if 'query' in data and 'search' in data['query']:
            for item in data['query']['search']:
                title = item['title']
                snippet = item['snippet'].replace('<span class="searchmatch">', '').replace('</span>', '')
                
                products.append({
                    "product_name": title,
                    "image_url": "",
                    "calories_100g": 0, # Википедия не дает калории
                    "proteins_100g": 0,
                    "fat_100g": 0,
                    "carbs_100g": 0,
                    "ingredients": snippet,
                    "description": "Данные из Википедии. Калории уточняются."
                })
        return jsonify({"products": products})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"products": []})

@app.route('/analyze', methods=['POST'])
def analyze_photo():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files['image']
    try:
        image_data = file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
    except:
        return jsonify({"error": "Invalid image"}), 400
    
    if LOGMEAL_TOKEN:
        try:
            img_byte_arr = io.BytesIO()
            image.save(img_byte_arr, format='JPEG')
            img_byte_arr = img_byte_arr.getvalue()
            files = {'image': ('food.jpg', img_byte_arr, 'image/jpeg')}
            headers = {'Authorization': f'Bearer {LOGMEAL_TOKEN}'}
            lm_response = requests.post('https://api.logmeal.es/v2/image/recognition/type', headers=headers, files=files, timeout=10)
            if lm_response.status_code == 200:
                lm_data = lm_response.json()
                if 'foodType' in lm_data and 'name' in lm_data['foodType']:
                    return jsonify({"food": lm_data['foodType']['name'], "calories": 250, "protein": 15, "fat": 10, "carbs": 30})
        except Exception as e:
            print(f"LogMeal error: {e}")
    return jsonify({"food": "Не удалось распознать", "calories": 0, "protein": 0, "fat": 0, "carbs": 0})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
