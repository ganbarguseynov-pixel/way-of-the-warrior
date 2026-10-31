from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# --- ЛОКАЛЬНАЯ БАЗА (ГДЕ ЕСТЬ ТОЧНЫЕ КАЛОРИИ) ---
LOCAL_DB = [
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23},
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11},
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0},
    {"name": "Рис", "cal": 130, "prot": 2.7, "fat": 0.3, "carb": 28},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1},
    {"name": "Пицца", "cal": 266, "prot": 11, "fat": 10, "carb": 33},
    {"name": "Бургер", "cal": 295, "prot": 15, "fat": 12, "carb": 30},
]

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    
    results = []
    query_lower = query.lower()
    
    # 1. ИЩЕМ В ЛОКАЛЬНОЙ БАЗЕ (точные калории)
    for p in LOCAL_DB:
        if query_lower in p["name"].lower():
            results.append({
                "product_name": p["name"],
                "image_url": "",
                "calories_100g": p["cal"],
                "proteins_100g": p["prot"],
                "fat_100g": p["fat"],
                "carbs_100g": p["carb"],
                "ingredients": "Точные данные из базы приложения",
                "description": ""
            })

    # 2. ЕСЛИ НЕ НАШЛИ, ИДЕМ В ВИКИПЕДИЮ (описание + картинка)
    if len(results) == 0:
        try:
            url = "https://ru.wikipedia.org/w/api.php"
            params = {
                "action": "query",
                "generator": "search",
                "gsrsearch": query,
                "gsrlimit": 2,
                "prop": "pageimages|extracts",
                "exintro": 1,
                "explaintext": 1,
                "pithumbsize": 200,
                "format": "json",
                "utf8": 1
            }
            headers = {'User-Agent': 'SportApp/1.0 (contact@example.com)'}
            response = requests.get(url, params=params, headers=headers, timeout=10)
            data = response.json()
            
            if 'query' in data and 'pages' in data['query']:
                for page_id, page in data['query']['pages'].items():
                    title = page.get('title', 'Без названия')
                    extract = page.get('extract', 'Описание отсутствует.')
                    image_url = page.get('thumbnail', {}).get('source', '')
                    
                    results.append({
                        "product_name": title,
                        "image_url": image_url,
                        "calories_100g": 0, # В википедии нет калорий
                        "proteins_100g": 0,
                        "fat_100g": 0,
                        "carbs_100g": 0,
                        "ingredients": extract,
                        "description": "Данные из Википедии"
                    })
        except Exception as e:
            print(f"Wiki error: {e}")

    return jsonify({"products": results})

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
