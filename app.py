from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# --- ЛОКАЛЬНАЯ БАЗА (БОЛЬШАЯ) ---
PRODUCTS_DB = [
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14},
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23},
    {"name": "Апельсин", "cal": 47, "prot": 0.9, "fat": 0.1, "carb": 12},
    {"name": "Помидор", "cal": 18, "prot": 0.9, "fat": 0.2, "carb": 3.9},
    {"name": "Огурец", "cal": 15, "prot": 0.7, "fat": 0.1, "carb": 3.6},
    {"name": "Картофель", "cal": 87, "prot": 2, "fat": 0.1, "carb": 20},
    {"name": "Йогурт", "cal": 60, "prot": 5, "fat": 3, "carb": 4},
    {"name": "Молоко", "cal": 52, "prot": 2.9, "fat": 2.5, "carb": 4.7},
    {"name": "Сыр", "cal": 402, "prot": 25, "fat": 33, "carb": 1.3},
    {"name": "Творог", "cal": 121, "prot": 17, "fat": 5, "carb": 3},
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0},
    {"name": "Лосось", "cal": 208, "prot": 20, "fat": 13, "carb": 0},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1},
    {"name": "Рис", "cal": 130, "prot": 2.7, "fat": 0.3, "carb": 28},
    {"name": "Гречка", "cal": 110, "prot": 4, "fat": 1, "carb": 20},
    {"name": "Овсянка", "cal": 88, "prot": 3, "fat": 1.7, "carb": 15},
    {"name": "Макароны", "cal": 131, "prot": 5, "fat": 1.1, "carb": 25},
    {"name": "Хлеб", "cal": 265, "prot": 9, "fat": 3.2, "carb": 49},
    {"name": "Кофе", "cal": 2, "prot": 0.1, "fat": 0, "carb": 0},
    {"name": "Чай", "cal": 1, "prot": 0, "fat": 0, "carb": 0},
    {"name": "Кола", "cal": 42, "prot": 0, "fat": 0, "carb": 10.6},
    {"name": "Сок", "cal": 45, "prot": 0.7, "fat": 0.2, "carb": 10.4},
    {"name": "Пицца", "cal": 266, "prot": 11, "fat": 10, "carb": 33},
    {"name": "Бургер", "cal": 295, "prot": 15, "fat": 12, "carb": 30},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11},
    {"name": "Мохито клубничное", "cal": 50, "prot": 0.2, "fat": 0, "carb": 12},
    {"name": "Шоколад", "cal": 546, "prot": 4.9, "fat": 31, "carb": 61},
    {"name": "Печенье", "cal": 417, "prot": 5, "fat": 15, "carb": 65}
]

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

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip().lower()
    if not query:
        return jsonify({"products": []})
    
    results = []
    for p in PRODUCTS_DB:
        # Ищем совпадение (поиск подстроки)
        if query in p["name"].lower():
            results.append({
                "product_name": p["name"],
                "image_url": "",
                "calories_100g": p["cal"],
                "proteins_100g": p["prot"],
                "fat_100g": p["fat"],
                "carbs_100g": p["carb"],
                "ingredients": "Локальная база",
                "description": ""
            })
    return jsonify({"products": results})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
