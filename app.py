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

# --- ЛОКАЛЬНАЯ БАЗА (ПРОСТЫЕ ПРОДУКТЫ) ---
LOCAL_DB = [
    {"name": "Куриная грудка", "cal": 165, "prot": 31, "fat": 3.6, "carb": 0, "img": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=200"},
    {"name": "Яйцо", "cal": 155, "prot": 13, "fat": 11, "carb": 1.1, "img": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=200"},
    {"name": "Салат", "cal": 15, "prot": 1.4, "fat": 0.2, "carb": 2.9, "img": "https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=200"},
    {"name": "Банан", "cal": 89, "prot": 1.1, "fat": 0.3, "carb": 23, "img": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=200"},
    {"name": "Яблоко", "cal": 52, "prot": 0.3, "fat": 0.2, "carb": 14, "img": "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=200"},
    {"name": "Мохито", "cal": 45, "prot": 0.1, "fat": 0, "carb": 11, "img": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=200"},
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
    {"name": "Кола", "cal": 42, "prot": 0, "fat": 0, "carb": 10.6, "img": "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=200"},
    {"name": "Сок", "cal": 45, "prot": 0.7, "fat": 0.2, "carb": 10.4, "img": "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=200"},
    {"name": "Шоколад", "cal": 546, "prot": 4.9, "fat": 31, "carb": 61, "img": "https://images.unsplash.com/photo-1511381939415-e44015466834?w=200"},
    {"name": "Печенье", "cal": 417, "prot": 5, "fat": 15, "carb": 65, "img": "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=200"},
    {"name": "Апельсин", "cal": 47, "prot": 0.9, "fat": 0.1, "carb": 12, "img": "https://images.unsplash.com/photo-1547514701-42782101795e?w=200"},
    {"name": "Помидор", "cal": 18, "prot": 0.9, "fat": 0.2, "carb": 3.9, "img": "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200"},
    {"name": "Огурец", "cal": 15, "prot": 0.7, "fat": 0.1, "carb": 3.6, "img": "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=200"},
    {"name": "Картофель", "cal": 87, "prot": 2, "fat": 0.1, "carb": 20, "img": "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=200"},
    {"name": "Лосось", "cal": 208, "prot": 20, "fat": 13, "carb": 0, "img": "https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=200"},
    {"name": "Свинина", "cal": 242, "prot": 27, "fat": 14, "carb": 0, "img": "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=200"},
    {"name": "Говядина", "cal": 250, "prot": 26, "fat": 15, "carb": 0, "img": "https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=200"},
    {"name": "Индейка", "cal": 189, "prot": 29, "fat": 7, "carb": 0, "img": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=200"},
    {"name": "Авокадо", "cal": 160, "prot": 2, "fat": 15, "carb": 9, "img": "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=200"},
    {"name": "Груша", "cal": 57, "prot": 0.4, "fat": 0.1, "carb": 15, "img": "https://images.unsplash.com/photo-1514756331096-242fdeb70d4a?w=200"},
    {"name": "Киви", "cal": 61, "prot": 1.1, "fat": 0.5, "carb": 15, "img": "https://images.unsplash.com/photo-1585059895524-72359e06133a?w=200"},
    {"name": "Мандарин", "cal": 53, "prot": 0.8, "fat": 0.3, "carb": 13, "img": "https://images.unsplash.com/photo-1557800636-894a64c1696f?w=200"},
    {"name": "Арбуз", "cal": 30, "prot": 0.6, "fat": 0.2, "carb": 8, "img": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=200"},
    {"name": "Дыня", "cal": 34, "prot": 0.8, "fat": 0.2, "carb": 8, "img": "https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=200"},
    {"name": "Виноград", "cal": 69, "prot": 0.7, "fat": 0.2, "carb": 18, "img": "https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=200"},
    {"name": "Клубника", "cal": 32, "prot": 0.7, "fat": 0.3, "carb": 8, "img": "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=200"},
    {"name": "Малина", "cal": 52, "prot": 1.2, "fat": 0.7, "carb": 12, "img": "https://images.unsplash.com/photo-1577003833619-76bbd7f82948?w=200"},
    {"name": "Черника", "cal": 57, "prot": 0.7, "fat": 0.3, "carb": 14, "img": "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=200"},
    {"name": "Грибы", "cal": 22, "prot": 3.1, "fat": 0.3, "carb": 3.3, "img": "https://images.unsplash.com/photo-1504545102780-26774c1bb073?w=200"},
    {"name": "Сметана", "cal": 206, "prot": 2.4, "fat": 20, "carb": 3, "img": "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=200"},
    {"name": "Масло сливочное", "cal": 717, "prot": 0.8, "fat": 81, "carb": 0.1, "img": "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=200"},
    {"name": "Масло растительное", "cal": 884, "prot": 0, "fat": 100, "carb": 0, "img": "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=200"},
    {"name": "Сахар", "cal": 387, "prot": 0, "fat": 0, "carb": 100, "img": "https://images.unsplash.com/photo-1581441363689-1f3c3c414635?w=200"},
    {"name": "Соль", "cal": 0, "prot": 0, "fat": 0, "carb": 0, "img": "https://images.unsplash.com/photo-1518110925495-5fe2fda0442c?w=200"},
    {"name": "Мед", "cal": 304, "prot": 0.3, "fat": 0, "carb": 82, "img": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=200"},
    {"name": "Орехи", "cal": 654, "prot": 15, "fat": 65, "carb": 14, "img": "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=200"},
    {"name": "Суши", "cal": 150, "prot": 6, "fat": 2, "carb": 28, "img": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200"},
    {"name": "Роллы", "cal": 180, "prot": 7, "fat": 4, "carb": 30, "img": "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=200"}
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

# --- РАСПОЗНАВАНИЕ ШТРИХ-КОДА НА СЕРВЕРЕ ---
@app.route('/scan_barcode', methods=['POST'])
def scan_barcode():
    if 'image' not in request.files:
        return jsonify({"error": "No image"}), 400
    
    file = request.files['image']
    try:
        # Пытаемся распознать штрих-код через pyzbar (нужно добавить в requirements)
        from pyzbar.pyzbar import decode
        from PIL import Image as PILImage
        img = PILImage.open(io.BytesIO(file.read()))
        decoded = decode(img)
        
        if decoded:
            barcode = decoded[0].data.decode('utf-8')
            return jsonify({"barcode": barcode})
        else:
            return jsonify({"error": "Barcode not found"}), 404
    except Exception as e:
        print(f"Barcode scan error: {e}")
        return jsonify({"error": "Scan failed"}), 500

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
