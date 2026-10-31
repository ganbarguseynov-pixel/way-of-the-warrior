from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# Простой словарь для перевода (чтобы Open Food Facts понимал запрос)
def translate_to_english(query):
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
        'суши': 'sushi', 'роллы': 'rolls', 'шоколадный батончик': 'chocolate bar'
    }
    words = query.lower().split()
    translated = [dictionary.get(w, w) for w in words]
    return ' '.join(translated)

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    
    # Переводим на английский для Open Food Facts
    eng_query = translate_to_english(query)
    
    try:
        headers = {'User-Agent': 'SportApp/1.0 (contact@example.com)'}
        url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={eng_query}&search_simple=1&action=process&json=1&page_size=5"
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()
        
        products = []
        if 'products' in data:
            for product in data['products']:
                name = product.get('product_name')
                if name:
                    nutrients = product.get('nutriments', {})
                    image_url = product.get('image_front_small_url') or product.get('image_url') or ''
                    
                    products.append({
                        "product_name": name,
                        "image_url": image_url, # Картинка из базы
                        "calories_100g": round(nutrients.get('energy-kcal_100g', 0), 1),
                        "proteins_100g": round(nutrients.get('proteins_100g', 0), 1),
                        "fat_100g": round(nutrients.get('fat_100g', 0), 1),
                        "carbs_100g": round(nutrients.get('carbohydrates_100g', 0), 1),
                        "ingredients": product.get('ingredients_text_ru') or product.get('ingredients_text') or 'Состав не указан',
                        "description": "Данные Open Food Facts"
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
