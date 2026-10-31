from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import openfoodfacts
import re
import time
from rapidfuzz import process, fuzz
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
USDA_API_KEY = os.environ.get("USDA_API_KEY")
api = openfoodfacts.API(user_agent="SportApp/1.0 (contact@example.com)")

client = None
if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        print("Gemini подключен успешно!")
    except Exception as e:
        print(f"Ошибка подключения Gemini: {e}")

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
        'кола зеро': 'coca-cola zero'
    }
    words = query.lower().split()
    if query.lower() in dictionary:
        return dictionary[query.lower()]
    translated = [dictionary.get(w, w) for w in words]
    return ' '.join(translated)

def get_food_image(query):
    try:
        url = "https://nkimages.com/api/public/images"
        params = {"source": "clawhub", "q": query, "per_page": 1}
        response = requests.get(url, params=params, timeout=5)
        data = response.json()
        if data.get("success") and data.get("data"):
            return data["data"][0]["url"]
    except Exception as e:
        print(f"NK Images error: {e}")
    return ""

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})

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
            api_results = api.product.text_search(eng_query, page_size=5)
            if api_results and 'products' in api_results:
                for product in api_results['products']:
                    name = product.get('product_name')
                    if not name: continue
                    nutrients = product.get('nutriments', {})
                    image_url = product.get('image_front_small_url') or product.get('image_url') or ''
                    results.append({"product_name": name, "image_url": image_url, "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1), "proteins_100g": round(nutrients.get('proteins_100g', 0), 1), "fat_100g": round(nutrients.get('fat_100g', 0), 1), "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1), "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан', "description": "Данные Open Food Facts"})
        except Exception as e: print(f"OFF error: {e}")

    if len(results) == 0 and USDA_API_KEY:
        eng_query = translate_to_english(query)
        try:
            url = f"https://api.nal.usda.gov/fdc/v1/foods/search?api_key={USDA_API_KEY}&query={eng_query}&pageSize=3"
            response = requests.get(url, timeout=10)
            data = response.json()
            if 'foods' in data:
                for food in data['foods']:
                    nutrients = {n['nutrientName']: n['value'] for n in food.get('foodNutrients', [])}
                    results.append({"product_name": food.get('description', 'Без названия'), "image_url": "", "calories_100g": round(nutrients.get('Energy', 0), 1), "proteins_100g": round(nutrients.get('Protein', 0), 1), "fat_100g": round(nutrients.get('Total lipid (fat)', 0), 1), "carbs_100g": round(nutrients.get('Carbohydrate, by difference', 0), 1), "ingredients": "Данные USDA FoodData Central", "description": ""})
        except Exception as e: print(f"USDA error: {e}")

    if len(results) == 0:
        eng_query = translate_to_english(query)
        try:
            url = f"https://www.fruityvice.com/api/fruit/{eng_query}"
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                data = response.json()
                nut = data.get('nutritions', {})
                if nut.get('calories') is not None:
                    results.append({"product_name": data.get('name', eng_query), "image_url": "", "calories_100g": round(nut.get('calories', 0), 1), "proteins_100g": round(nut.get('protein', 0), 1), "fat_100g": round(nut.get('fat', 0), 1), "carbs_100g": round(nut.get('carbohydrates', 0), 1), "ingredients": "Данные Fruityvice", "description": ""})
        except Exception as e: print(f"Fruityvice error: {e}")

    for product in results:
        if not product["image_url"]:
            product["image_url"] = get_food_image(product["product_name"])

    return jsonify({"products": results})

@app.route('/barcode', methods=['GET'])
def search_by_barcode():
    barcode = request.args.get('code', '').strip()
    if not barcode:
        return jsonify({"products": []})
    try:
        product = api.product.get(barcode)
        if product and product.get('product_name'):
            nutrients = product.get('nutriments', {})
            image_url = product.get('image_front_small_url') or product.get('image_url') or ''
            result = {"product_name": product.get('product_name'), "image_url": image_url, "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1), "proteins_100g": round(nutrients.get('proteins_100g', 0), 1), "fat_100g": round(nutrients.get('fat_100g', 0), 1), "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1), "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан', "description": "Найдено по штрих-коду"}
            return jsonify({"products": [result]})
        return jsonify({"products": []})
    except Exception as e:
        print(f"Barcode error: {e}")
        return jsonify({"products": []})

@app.route('/scan_barcode', methods=['POST'])
def scan_barcode():
    return jsonify({"error": "Barcode scanning via camera temporarily disabled"}), 503

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

    if not client:
        return jsonify({"food": "Ошибка: ИИ не настроен", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "Проверьте API ключ Gemini"})

    try:
        img_byte_arr = io.BytesIO()
        image.thumbnail((800, 800))
        image.save(img_byte_arr, format='JPEG', quality=75)
        compressed_image_data = img_byte_arr.getvalue()

        prompt = """
        Ты — профессиональный диетолог. Твоя задача — определить еду на фото.
        
        ПРАВИЛА:
        1. Если на упаковке есть бренд или название на английском языке, напиши это название как есть (на английском), но остальное описание — на русском.
        2. В остальных случаях ВСЕГДА пиши название еды на РУССКОМ языке.
        3. Обязательно напиши краткое описание продукта (например, "Жареная куриная грудка с овощами").
        4. Дай точные данные БЖУ и калорий на 100 грамм.
        
        Формат ответа (строго через вертикальную черту |):
        Название | Калории | Белки | Жиры | Углеводы | Описание
        
        Пример 1: Куриная грудка | 165 | 31 | 3.6 | 0 | Жареная куриная грудка без кожи.
        Пример 2: Snickers | 500 | 10 | 25 | 60 | Шоколадный батончик с карамелью и арахисом.
        """
        
        response = None
        max_retries = 4
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model='gemini-3.8-flash',
                    contents=[types.Part.from_bytes(data=compressed_image_data, mime_type='image/jpeg'), prompt]
                )
                break
            except Exception as e:
                error_str = str(e)
                if ("503" in error_str or "429" in error_str) and attempt < max_retries - 1:
                    wait_time = 5 * (attempt + 1)
                    print(f"Ошибка {error_str[:20]}... Ждем {wait_time} сек...")
                    time.sleep(wait_time)
                else:
                    raise e
        
        parts = [p.strip() for p in response.text.strip().split('|')]
        
        if len(parts) >= 6:
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
                "description": parts[5]
            })
        else:
            return jsonify({"food": "Не удалось распознать", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "ИИ ответил не по формату"})
            
    except Exception as e:
        print(f"Gemini error: {e}")
        return jsonify({"food": "Ошибка ИИ", "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "description": "Попробуйте через минуту."})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
