from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import openfoodfacts
import re
from rapidfuzz import process, fuzz
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

OFOX_API_KEY = os.environ.get("OFOX_API_KEY", "sk-of-QZJLAGlHceOaKnlXuLZlbWqJkufzujxgNbAJqxOvGguKzTHeyQdZXaAcPmKOuTmo")
USDA_API_KEY = os.environ.get("USDA_API_KEY")
api = openfoodfacts.API(user_agent="SportApp/1.0 (contact@example.com)")

client = genai.Client(
    api_key=OFOX_API_KEY,
    http_options={"base_url": "https://api.ofox.ai/gemini", "api_version": "v1beta"}
)

SEARCH_CACHE = {}
BARCODE_CACHE = {}
DEFAULT_IMG = "https://cdn-icons-png.flaticon.com/512/3081/3081986.png"

LOCAL_DB = [
    {"name": "Курица", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0, "img": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=200"},
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0, "img": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=200"},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1, "img": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=200"},
    {"name": "Яйца", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1, "img": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=200"},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11, "img": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=200"},
    {"name": "Адреналин", "cal": 45, "prot": 0, "fat": 0, "carb": 11, "img": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200"},
    {"name": "Йогурт", "cal": 60, "prot": 5, "fat": 3, "carb": 4, "img": "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=200"},
    {"name": "Кола", "cal": 42, "prot": 0, "fat": 0, "carb": 10.6, "img": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200"},
    {"name": "Кола Зеро", "cal": 0, "prot": 0, "fat": 0, "carb": 0, "img": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200"},
    {"name": "Салат", "cal": 15, "prot": 1.4, "fat": 0.2, "carb": 2.9, "img": "https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=200"},
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23, "img": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200"},
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14, "img": "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200"},
    {"name": "Рис", "cal": 130, "prot": 2.7, "fat": 0.3, "carb": 28, "img": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200"},
    {"name": "Пицца", "cal": 266, "prot": 11, "fat": 10, "carb": 33, "img": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200"},
    {"name": "Бургер", "cal": 295, "prot": 15, "fat": 12, "carb": 30, "img": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200"},
    {"name": "Молоко", "cal": 52, "prot": 2.9, "fat": 2.5, "carb": 4.7, "img": "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=200"},
    {"name": "Сыр", "cal": 402, "prot": 25, "fat": 33, "carb": 1.3, "img": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=200"},
    {"name": "Творог", "cal": 121, "prot": 17, "fat": 5, "carb": 3, "img": "https://images.unsplash.com/photo-1559561853-08451507cbe7?w=200"},
    {"name": "Гречка", "cal": 110, "prot": 4, "fat": 1, "carb": 20, "img": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=200"},
    {"name": "Овсянка", "cal": 88, "prot": 3, "fat": 1.7, "carb": 15, "img": "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=200"},
    {"name": "Макароны", "cal": 131, "prot": 5, "fat": 1.1, "carb": 25, "img": "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=200"},
    {"name": "Хлеб", "cal": 265, "prot": 9, "fat": 3.2, "carb": 49, "img": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200"},
    {"name": "Кофе", "cal": 2, "prot": 0.1, "fat": 0, "carb": 0, "img": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200"},
    {"name": "Чай", "cal": 1, "prot": 0, "fat": 0, "carb": 0, "img": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=200"},
    {"name": "Сок", "cal": 45, "prot": 0.7, "fat": 0.2, "carb": 10.4, "img": "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=200"},
    {"name": "Шоколад", "cal": 546, "prot": 4.9, "fat": 31, "carb": 61, "img": "https://images.unsplash.com/photo-1511381939415-e44015466834?w=200"},
    {"name": "Апельсин", "cal": 47, "prot": 0.9, "fat": 0.1, "carb": 12, "img": "https://images.unsplash.com/photo-1547514701-42782101795e?w=200"},
    {"name": "Помидор", "cal": 18, "prot": 0.9, "fat": 0.2, "carb": 3.9, "img": "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200"},
    {"name": "Огурец", "cal": 15, "prot": 0.7, "fat": 0.1, "carb": 3.6, "img": "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=200"},
    {"name": "Картофель", "cal": 87, "prot": 2, "fat": 0.1, "carb": 20, "img": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200"},
    {"name": "Арбуз", "cal": 30, "prot": 0.6, "fat": 0.2, "carb": 8, "img": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=200"},
]

LOCAL_NAMES = [p["name"] for p in LOCAL_DB]

def translate_to_english(query):
    if re.search('[a-zA-Z]', query):
        return query
    dictionary = {
        'яблоко': 'apple', 'банан': 'banana', 'мохито': 'mojito', 'адреналин': 'adrenaline',
        'курица': 'chicken', 'рис': 'rice', 'яйцо': 'egg', 'яйца': 'eggs', 'пицца': 'pizza',
        'бургер': 'burger', 'молоко': 'milk', 'сыр': 'cheese', 'творог': 'cottage cheese',
        'гречка': 'buckwheat', 'овсянка': 'oatmeal', 'макароны': 'pasta', 'хлеб': 'bread',
        'кофе': 'coffee', 'чай': 'tea', 'кола': 'cola', 'сок': 'juice', 'шоколад': 'chocolate',
        'печенье': 'cookie', 'апельсин': 'orange', 'помидор': 'tomato', 'огурец': 'cucumber',
        'картофель': 'potato', 'лосось': 'salmon', 'свинина': 'pork', 'говядина': 'beef',
        'индейка': 'turkey', 'салат': 'salad', 'авокадо': 'avocado', 'груша': 'pear',
        'киви': 'kiwi', 'мандарин': 'tangerine', 'арбуз': 'watermelon', 'дыня': 'melon',
        'виноград': 'grapes', 'клубника': 'strawberry', 'малина': 'raspberry',
        'черника': 'blueberry', 'грибы': 'mushrooms', 'сметана': 'sour cream',
        'масло': 'butter', 'сахар': 'sugar', 'мед': 'honey', 'орехи': 'nuts',
        'суши': 'sushi', 'роллы': 'rolls', 'чипсы': 'chips', 'сникерс': 'snickers',
        'марс': 'mars', 'йогурт': 'yogurt', 'теос': 'teos', 'зеро': 'zero',
        'кола зеро': 'coca-cola zero', 'кефир': 'kefir'
    }
    words = query.lower().split()
    if query.lower() in dictionary:
        return dictionary[query.lower()]
    translated = [dictionary.get(w, w) for w in words]
    return ' '.join(translated)

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})

    cache_key = query.lower()
    if cache_key in SEARCH_CACHE:
        return jsonify({"products": SEARCH_CACHE[cache_key]})

    results = []
    best_match = process.extractOne(query, LOCAL_NAMES, scorer=fuzz.WRatio, score_cutoff=60)
    if best_match:
        matched_name = best_match[0]
        for p in LOCAL_DB:
            if p["name"] == matched_name:
                results.append({"product_name": p["name"], "image_url": p["img"], "calories_100g": p["cal"], "proteins_100g": p["prot"], "fat_100g": p["fat"], "carbs_100g": p["carb"], "ingredients": "Точные данные", "description": ""})
                break

    if len(results) == 0:
        eng_query = translate_to_english(query)
        try:
            api_results = api.product.text_search(eng_query, page_size=10)
            if api_results and 'products' in api_results:
                for product in api_results['products']:
                    name = product.get('product_name')
                    if not name: continue
                    nutrients = product.get('nutriments', {})
                    image_url = product.get('image_front_small_url') or product.get('image_url') or DEFAULT_IMG
                    results.append({"product_name": name, "image_url": image_url, "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1), "proteins_100g": round(nutrients.get('proteins_100g', 0), 1), "fat_100g": round(nutrients.get('fat_100g', 0), 1), "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1), "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан', "description": "Данные Open Food Facts"})
        except Exception as e:
            print(f"OFF error: {e}")

    if len(results) == 0 and USDA_API_KEY:
        eng_query = translate_to_english(query)
        try:
            url = f"https://api.nal.usda.gov/fdc/v1/foods/search?api_key={USDA_API_KEY}&query={eng_query}&pageSize=5"
            response = requests.get(url, timeout=10)
            data = response.json()
            if 'foods' in data:
                for food in data['foods']:
                    nutrients = {n['nutrientName']: n['value'] for n in food.get('foodNutrients', [])}
                    results.append({"product_name": food.get('description', 'Без названия'), "image_url": DEFAULT_IMG, "calories_100g": round(nutrients.get('Energy', 0), 1), "proteins_100g": round(nutrients.get('Protein', 0), 1), "fat_100g": round(nutrients.get('Total lipid (fat)', 0), 1), "carbs_100g": round(nutrients.get('Carbohydrate, by difference', 0), 1), "ingredients": "Данные USDA FoodData Central", "description": ""})
        except Exception as e:
            print(f"USDA error: {e}")

    for p in results:
        if not p["image_url"]: p["image_url"] = DEFAULT_IMG

    if results:
        SEARCH_CACHE[cache_key] = results

    return jsonify({"products": results})

@app.route('/barcode', methods=['GET'])
def search_by_barcode():
    barcode = request.args.get('code', '').strip()
    if not barcode:
        return jsonify({"products": []})

    if barcode in BARCODE_CACHE:
        return jsonify({"products": BARCODE_CACHE[barcode]})

    try:
        product = api.product.get(barcode)
        if product and product.get('product_name'):
            nutrients = product.get('nutriments', {})
            image_url = product.get('image_front_small_url') or product.get('image_url') or DEFAULT_IMG
            result = {"product_name": product.get('product_name'), "image_url": image_url, "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1), "proteins_100g": round(nutrients.get('proteins_100g', 0), 1), "fat_100g": round(nutrients.get('fat_100g', 0), 1), "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1), "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан', "description": "Найдено по штрих-коду"}
            BARCODE_CACHE[barcode] = [result]
            return jsonify({"products": [result]})
        return jsonify({"products": []})
    except Exception as e:
        print(f"Barcode error: {e}")
        return jsonify({"products": []})

@app.route('/scan_barcode', methods=['POST'])
def scan_barcode():
    if 'image' not in request.files:
        return jsonify({"error": "No image"}), 400
    file = request.files['image']

    try:
        image_data = file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")

        img_byte_arr = io.BytesIO()
        image.thumbnail((1000, 1000))
        image.save(img_byte_arr, format='JPEG', quality=85)
        compressed_image_data = img_byte_arr.getvalue()

        prompt = "Найди штрих-код. Напиши только цифры или 'НЕТ'."

        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=[types.Part.from_bytes(data=compressed_image_data, mime_type='image/jpeg'), prompt]
        )

        barcode_text = response.text.strip()
        barcode_digits = re.sub(r'\D', '', barcode_text)

        if len(barcode_digits) >= 8:
            return jsonify({"barcode": barcode_digits})
        else:
            return jsonify({"error": "Barcode not found"}), 404

    except Exception as e:
        print(f"Gemini Barcode error: {e}")
        return jsonify({"error": "Scan failed"}), 500

@app.route('/analyze', methods=['POST'])
def analyze_photo():
    if 'image' not in request.files:
        return jsonify({"food": "Ошибка", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "Фото не загружено."}), 400
    file = request.files['image']
    try:
        image_data = file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
    except:
        return jsonify({"food": "Ошибка", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "Не удалось прочитать фото."}), 400

    try:
        img_byte_arr = io.BytesIO()
        image.thumbnail((800, 800))
        image.save(img_byte_arr, format='JPEG', quality=75)
        compressed_image_data = img_byte_arr.getvalue()

        # ЖЕСТКИЙ ПРОМПТ
        prompt = """Ты — калькулятор калорий. Никаких вступлений, приветствий и рассуждений. 
Оцени продукт на фото. Если это напиток, оцени стандартную порцию (стакан 200-250 мл). 
Если это еда, оцени стандартную порцию.
Выведи СТРОГО ОДНУ строку в таком формате, без лишних слов:
Название | Калории | Белки | Жиры | Углеводы

Пример: Черный чай с сахаром | 20 | 0 | 0 | 5
Пример: Банан | 89 | 1.1 | 0.3 | 23
"""

        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=[types.Part.from_bytes(data=compressed_image_data, mime_type='image/jpeg'), prompt]
        )

        clean_text = re.sub(r'[*#_]', '', response.text.strip())
        
        # Ищем строку с разделителями |
        lines = clean_text.split('\n')
        target_line = ""
        for line in lines:
            if '|' in line:
                target_line = line
                break

        if not target_line:
            target_line = clean_text

        parts = [p.strip() for p in target_line.split('|')]

        if len(parts) >= 5:
            cal = int(re.sub(r'\D', '', parts[1])) if re.search(r'\d', parts[1]) else 250
            prot = int(re.sub(r'\D', '', parts[2])) if re.search(r'\d', parts[2]) else 15
            fat = int(re.sub(r'\D', '', parts[3])) if re.search(r'\d', parts[3]) else 10
            carb = int(re.sub(r'\D', '', parts[4])) if re.search(r'\d', parts[4]) else 30

            return jsonify({
                "food": parts[0],
                "calories": cal,
                "protein": prot,
                "fat": fat,
                "carbs": carb,
                "description": ""
            })
        else:
            return jsonify({"food": "Не удалось", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "ИИ не разобрал."})

    except Exception as e:
        print(f"Ofox error: {e}")
        return jsonify({"food": "Ошибка ИИ", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": f"Ошибка: {str(e)}"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
