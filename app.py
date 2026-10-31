from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import openfoodfacts
import re
from rapidfuzz import process, fuzz

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
api = openfoodfacts.API(user_agent="SportApp/1.0 (contact@example.com)")

# ... (ОСТАВЬ ЗДЕСЬ ВСЮ ЛОКАЛЬНУЮ БАЗУ LOCAL_DB ИЗ ПРОШЛОГО КОДА) ...
# Я не буду копировать 50 продуктов, чтобы не загромождать, вставь их из прошлого сообщения.
LOCAL_DB = [
    {"name": "Салат", "cal": 15, "prot": 1.4, "fat": 0.2, "carb": 2.9, "img": "https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=200"},
    # ... и так далее все остальные ...
]

LOCAL_NAMES = [p["name"] for p in LOCAL_DB]

def translate_to_english(query):
    if re.search('[a-zA-Z]', query):
        return query
    dictionary = { 'яблоко': 'apple', 'банан': 'banana', 'мохито': 'mojito', 'адреналин': 'adrenaline', 'курица': 'chicken', 'рис': 'rice', 'яйцо': 'egg', 'пицца': 'pizza', 'бургер': 'burger', 'молоко': 'milk', 'сыр': 'cheese', 'творог': 'cottage cheese', 'гречка': 'buckwheat', 'овсянка': 'oatmeal', 'макароны': 'pasta', 'хлеб': 'bread', 'кофе': 'coffee', 'чай': 'tea', 'кола': 'cola', 'сок': 'juice', 'шоколад': 'chocolate', 'печенье': 'cookie', 'апельсин': 'orange', 'помидор': 'tomato', 'огурец': 'cucumber', 'картофель': 'potato', 'лосось': 'salmon', 'свинина': 'pork', 'говядина': 'beef', 'индейка': 'turkey', 'салат': 'salad', 'авокадо': 'avocado', 'груша': 'pear', 'киви': 'kiwi', 'мандарин': 'tangerine', 'арбуз': 'watermelon', 'дыня': 'melon', 'виноград': 'grapes', 'клубника': 'strawberry', 'малина': 'raspberry', 'черника': 'blueberry', 'грибы': 'mushrooms', 'сметана': 'sour cream', 'масло': 'butter', 'сахар': 'sugar', 'мед': 'honey', 'орехи': 'nuts', 'суши': 'sushi', 'роллы': 'rolls', 'чипсы': 'chips', 'сникерс': 'snickers', 'марс': 'mars', 'клубничное': 'strawberry', 'клубничный': 'strawberry', 'йогурт': 'yogurt', 'теос': 'teos' }
    words = query.lower().split()
    translated = [dictionary.get(w, w) for w in words]
    return ' '.join(translated)

@app.route('/search', methods=['GET'])
def search_food():
    # ... (КОД ПОИСКА ПО ТЕКСТУ ОСТАВЬ БЕЗ ИЗМЕНЕНИЙ) ...
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    results = []
    normalized_query = re.sub(r'[\s\-]', '', query.lower())
    for p in LOCAL_DB:
        if normalized_query in re.sub(r'[\s\-]', '', p["name"].lower()):
            results.append({"product_name": p["name"], "image_url": p["img"], "calories_100g": p["cal"], "proteins_100g": p["prot"], "fat_100g": p["fat"], "carbs_100g": p["carb"], "ingredients": "Точные данные", "description": ""})
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
                    results.append({"product_name": name, "image_url": image_url, "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1), "proteins_100g": round(nutrients.get('proteins_100g', 0), 1), "fat_100g": round(nutrients.get('fat_100g', 0), 1), "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1), "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан', "description": "Данные Open Food Facts"})
        except Exception as e:
            print(f"Search error: {e}")
    return jsonify({"products": results})

# --- НОВАЯ ФУНКЦИЯ: ПОИСК ПО ШТРИХ-КОДУ ---
@app.route('/barcode', methods=['GET'])
def search_by_barcode():
    barcode = request.args.get('code', '').strip()
    if not barcode:
        return jsonify({"products": []})
    
    try:
        # Ищем продукт по штрих-коду в Open Food Facts
        product = api.product.get(barcode)
        
        if product and product.get('product_name'):
            nutrients = product.get('nutriments', {})
            image_url = product.get('image_front_small_url') or product.get('image_url') or ''
            
            result = {
                "product_name": product.get('product_name'),
                "image_url": image_url,
                "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1),
                "proteins_100g": round(nutrients.get('proteins_100g', 0), 1),
                "fat_100g": round(nutrients.get('fat_100g', 0), 1),
                "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1),
                "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан',
                "description": "Найдено по штрих-коду"
            }
            return jsonify({"products": [result]})
        else:
            return jsonify({"products": []})
    except Exception as e:
        print(f"Barcode error: {e}")
        return jsonify({"products": []})

# ... (ФУНКЦИЯ /analyze ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ) ...
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
