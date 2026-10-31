from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import openfoodfacts
import re

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
api = openfoodfacts.API(user_agent="SportApp/1.0 (contact@example.com)")

# Локальная база (простые продукты)
LOCAL_DB = [
    {"name": "Салат", "cal": 15, "prot": 1.4, "fat": 0.2, "carb": 2.9},
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23},
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11},
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0},
    {"name": "Рис", "cal": 130, "prot": 2.7, "fat": 0.3, "carb": 28},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1},
    {"name": "Пицца", "cal": 266, "prot": 11, "fat": 10, "carb": 33},
    {"name": "Бургер", "cal": 295, "prot": 15, "fat": 12, "carb": 30},
    {"name": "Молоко", "cal": 52, "prot": 2.9, "fat": 2.5, "carb": 4.7},
    {"name": "Сыр", "cal": 402, "prot": 25, "fat": 33, "carb": 1.3},
    {"name": "Творог", "cal": 121, "prot": 17, "fat": 5, "carb": 3},
    {"name": "Гречка", "cal": 110, "prot": 4, "fat": 1, "carb": 20},
    {"name": "Овсянка", "cal": 88, "prot": 3, "fat": 1.7, "carb": 15},
    {"name": "Макароны", "cal": 131, "prot": 5, "fat": 1.1, "carb": 25},
    {"name": "Хлеб", "cal": 265, "prot": 9, "fat": 3.2, "carb": 49},
    {"name": "Кофе", "cal": 2, "prot": 0.1, "fat": 0, "carb": 0},
    {"name": "Чай", "cal": 1, "prot": 0, "fat": 0, "carb": 0},
    {"name": "Кола", "cal": 42, "prot": 0, "fat": 0, "carb": 10.6},
    {"name": "Сок", "cal": 45, "prot": 0.7, "fat": 0.2, "carb": 10.4},
    {"name": "Шоколад", "cal": 546, "prot": 4.9, "fat": 31, "carb": 61},
    {"name": "Печенье", "cal": 417, "prot": 5, "fat": 15, "carb": 65},
    {"name": "Апельсин", "cal": 47, "prot": 0.9, "fat": 0.1, "carb": 12},
    {"name": "Помидор", "cal": 18, "prot": 0.9, "fat": 0.2, "carb": 3.9},
    {"name": "Огурец", "cal": 15, "prot": 0.7, "fat": 0.1, "carb": 3.6},
    {"name": "Картофель", "cal": 87, "prot": 2, "fat": 0.1, "carb": 20},
    {"name": "Лосось", "cal": 208, "prot": 20, "fat": 13, "carb": 0},
    {"name": "Свинина", "cal": 242, "prot": 27, "fat": 14, "carb": 0},
    {"name": "Говядина", "cal": 250, "prot": 26, "fat": 15, "carb": 0},
    {"name": "Индейка", "cal": 189, "prot": 29, "fat": 7, "carb": 0},
    {"name": "Авокадо", "cal": 160, "prot": 2, "fat": 15, "carb": 9},
    {"name": "Груша", "cal": 57, "prot": 0.4, "fat": 0.1, "carb": 15},
    {"name": "Киви", "cal": 61, "prot": 1.1, "fat": 0.5, "carb": 15},
    {"name": "Мандарин", "cal": 53, "prot": 0.8, "fat": 0.3, "carb": 13},
    {"name": "Арбуз", "cal": 30, "prot": 0.6, "fat": 0.2, "carb": 8},
    {"name": "Дыня", "cal": 34, "prot": 0.8, "fat": 0.2, "carb": 8},
    {"name": "Виноград", "cal": 69, "prot": 0.7, "fat": 0.2, "carb": 18},
    {"name": "Клубника", "cal": 32, "prot": 0.7, "fat": 0.3, "carb": 8},
    {"name": "Малина", "cal": 52, "prot": 1.2, "fat": 0.7, "carb": 12},
    {"name": "Черника", "cal": 57, "prot": 0.7, "fat": 0.3, "carb": 14},
    {"name": "Грибы", "cal": 22, "prot": 3.1, "fat": 0.3, "carb": 3.3},
    {"name": "Сметана", "cal": 206, "prot": 2.4, "fat": 20, "carb": 3},
    {"name": "Масло сливочное", "cal": 717, "prot": 0.8, "fat": 81, "carb": 0.1},
    {"name": "Масло растительное", "cal": 884, "prot": 0, "fat": 100, "carb": 0},
    {"name": "Сахар", "cal": 387, "prot": 0, "fat": 0, "carb": 100},
    {"name": "Соль", "cal": 0, "prot": 0, "fat": 0, "carb": 0},
    {"name": "Мед", "cal": 304, "prot": 0.3, "fat": 0, "carb": 82},
    {"name": "Орехи", "cal": 654, "prot": 15, "fat": 65, "carb": 14},
    {"name": "Суши", "cal": 150, "prot": 6, "fat": 2, "carb": 28},
    {"name": "Роллы", "cal": 180, "prot": 7, "fat": 4, "carb": 30}
]

def normalize_text(text):
    """Убирает пробелы, дефисы и приводит к нижнему регистру для простого поиска"""
    return re.sub(r'[\s\-]', '', text.lower())

def translate_to_english(query):
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
    normalized_query = normalize_text(query)
    
    # 1. ИЩЕМ В ЛОКАЛЬНОЙ БАЗЕ (по нормализованному тексту)
    for p in LOCAL_DB:
        if normalized_query in normalize_text(p["name"]):
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

    # 2. ЕСЛИ В БАЗЕ НЕТ, ИДЕМ В OPEN FOOD FACTS
    if len(results) == 0:
        eng_query = translate_to_english(query)
        try:
            api_results = api.product.text_search(eng_query, page_size=5)
            if api_results and 'products' in api_results:
                for product in api_results['products']:
                    name = product.get('product_name')
                    if not name: continue
                    
                    nutrients = product.get('nutriments', {})
                    image_url = product.get('image_front_small_url') or product.get('image_url') or ''
                    
                    has_nutrients = any([
                        nutrients.get('energy-kcal_100g', 0) > 0,
                        nutrients.get('proteins_100g', 0) > 0,
                        nutrients.get('fat_100g', 0) > 0,
                        nutrients.get('carbohydrates_100g', 0) > 0
                    ])

                    results.append({
                        "product_name": name,
                        "image_url": image_url,
                        "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1),
                        "proteins_100g": round(nutrients.get('proteins_100g', 0), 1),
                        "fat_100g": round(nutrients.get('fat_100g', 0), 1),
                        "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1),
                        "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан',
                        "description": "Данные Open Food Facts" if has_nutrients else "Данные Open Food Facts (БЖУ не заполнено)"
                    })
        except Exception as e:
            print(f"Search error: {e}")

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
