from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

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
    
    # 1. ПРОБУЕМ LOGMEAL
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

    # 2. ПРОБУЕМ GEMINI
    if GEMINI_API_KEY:
        try:
            prompt = "What food is in this image? Answer in one short phrase in Russian. Also estimate calories, protein, fat, and carbs. Format: Food name | Calories | Protein | Fat | Carbs"
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=[types.Part.from_bytes(data=image_data, mime_type='image/jpeg'), prompt]
            )
            parts = [p.strip() for p in response.text.strip().split('|')]
            if len(parts) >= 5:
                return jsonify({
                    "food": parts[0],
                    "calories": int(''.join(filter(str.isdigit, parts[1]))) if any(c.isdigit() for c in parts[1]) else 250,
                    "protein": int(''.join(filter(str.isdigit, parts[2]))) if any(c.isdigit() for c in parts[2]) else 15,
                    "fat": int(''.join(filter(str.isdigit, parts[3]))) if any(c.isdigit() for c in parts[3]) else 10,
                    "carbs": int(''.join(filter(str.isdigit, parts[4]))) if any(c.isdigit() for c in parts[4]) else 30
                })
        except Exception as e:
            print(f"Gemini error: {e}")

    return jsonify({"food": "Не удалось распознать", "calories": 0, "protein": 0, "fat": 0, "carbs": 0})

# --- НОВАЯ ФУНКЦИЯ ПОИСКА (ДОБАВЛЕНА) ---
@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({"products": []})
    
    result = try_search_off(query)
    
    if not result and any(c in 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя' for c in query.lower()):
        eng_query = translate_food(query)
        if eng_query:
            result = try_search_off(eng_query)
    
    return jsonify({"products": result})

def try_search_off(query):
    try:
        headers = {'User-Agent': 'SportApp/1.0 (contact@example.com)'}
        url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&search_simple=1&action=process&json=1&page_size=3"
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()
        
        products = []
        if 'products' in data:
            for product in data['products']:
                if product.get('product_name'):
                    nutrients = product.get('nutriments', {})
                    products.append({
                        "product_name": product.get('product_name'),
                        "nutrients": {
                            "proteins": nutrients.get('proteins_100g', 0),
                            "fat": nutrients.get('fat_100g', 0),
                            "carbohydrates": nutrients.get('carbohydrates_100g', 0)
                        }
                    })
        return products
    except Exception as e:
        print(f"Search error: {e}")
        return []

def translate_food(rus_word):
    dictionary = {
        'яблоко': 'apple', 'банан': 'banana', 'йогурт': 'yogurt', 'молоко': 'milk',
        'хлеб': 'bread', 'курица': 'chicken', 'рис': 'rice', 'яйцо': 'egg',
        'сыр': 'cheese', 'мясо': 'meat', 'рыба': 'fish', 'овсянка': 'oatmeal',
        'творог': 'cottage cheese', 'сок': 'juice', 'вода': 'water'
    }
    return dictionary.get(rus_word.lower())

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
