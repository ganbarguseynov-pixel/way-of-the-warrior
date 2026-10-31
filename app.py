from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import re

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# Локальная база для простых продуктов (банан, яблоко и т.д.)
LOCAL_DB = [
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23},
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11},
    {"name": "Салат", "cal": 15, "prot": 1.4, "fat": 0.2, "carb": 2.9},
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0},
    {"name": "Рис", "cal": 130, "prot": 2.7, "fat": 0.3, "carb": 28},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1},
    {"name": "Пицца", "cal": 266, "prot": 11, "fat": 10, "carb": 33},
    {"name": "Бургер", "cal": 295, "prot": 15, "fat": 12, "carb": 30},
    {"name": "Adrenaline", "cal": 45, "prot": 0, "fat": 0, "carb": 11}, # Английский вариант
]

def translate_to_english(query):
    # Если запрос содержит латиницу, переводить не нужно
    if re.search('[a-zA-Z]', query):
        return query

    dictionary = {
        'яблоко': 'apple', 'банан': 'banana', 'мохито': 'mojito', 'адреналин': 'adrenaline',
        'курица': 'chicken', 'рис': 'rice', 'яйцо': 'egg', 'пицца': 'pizza', 'бургер': 'burger',
        'молоко': 'milk', 'сыр': 'cheese', 'творог': 'cottage cheese', 'гречка': 'buckwheat',
        'овсянка': 'oatmeal', 'макароны': 'pasta', 'хлеб': 'bread', 'кофе': 'coffee',
        'чай': 'tea', 'кола': 'cola', 'сок': 'juice', 'шоколад': 'chocolate', 'печенье': 'cookie',
        'апельсин': 'orange', 'помидор': 'tomato', 'огурец': 'cucumber', 'картофель': 'potato',
        'лосось': 'salmon', 'свинина': 'pork', 'говядина': 'beef', 'индейка': 'turkey',
        'салат': 'salad', 'авокадо': 'avocado', 'груша': 'pear', 'киви': 'kiwi',
        'мандарин': 'tangerine', 'арбуз': 'watermelon', 'дыня': 'melon', 'виноград': 'grapes',
        'клубника': 'strawberry', 'малина': 'raspberry', 'черника': 'blueberry', 'грибы': 'mushrooms',
        'сметана': 'sour cream', 'масло': 'butter', 'сахар': 'sugar', 'мед': 'honey', 'орехи': 'nuts',
        'суши': 'sushi', 'роллы': 'rolls', 'чипсы': 'chips', 'сникерс': 'snickers', 'марс': 'mars',
        'клубничное': 'strawberry', 'клубничный': 'strawberry', 'йогурт': 'yogurt', 'теос': 'teos'
    }
    words = query.lower().split()
    translated = [dictionary.get(w, w) for w in words]
    return ' '.join(translated)

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    
    results = []
    query_lower = query.lower()
    
    # 1. ЛОКАЛЬНАЯ БАЗА
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

    # 2. DIETLY API (БЕЗ КЛЮЧА)
    if len(results) == 0:
        eng_query = translate_to_english(query)
        try:
            url = f"https://api.getdietly.com/search?q={eng_query}&limit=5"
            headers = {'User-Agent': 'SportApp/1.0 (contact@example.com)'}
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()
            
            if isinstance(data, list):
                for item in data:
                    results.append({
                        "product_name": item.get('name', 'Неизвестно'),
                        "image_url": item.get('image_url', ''),
                        "calories_100g": item.get('calories', 0),
                        "proteins_100g": item.get('protein_g', 0),
                        "fat_100g": item.get('fat_g', 0),
                        "carbs_100g": item.get('carbs_g', 0),
                        "ingredients": "Данные DietlyAPI",
                        "description": ""
                    })
        except Exception as e:
            print(f"Dietly error: {e}")

    return jsonify({"products": results})

@app.route('/analyze', methods=['POST'])
def analyze_photo():
    # ... (этот код остается без изменений) ...
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
