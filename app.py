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
CALORIE_NINJAS_API_KEY = os.environ.get("CALORIE_NINJAS_API_KEY")

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

# --- ПОИСК ЧЕРЕЗ CALORIE NINJAS (С ПЕРЕВОДОМ) ---
@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query or not CALORIE_NINJAS_API_KEY:
        return jsonify({"products": []})
    
    # Переводим запрос на английский (CalorieNinjas понимает только его)
    eng_query = translate_to_english(query)
    
    try:
        headers = {'X-Api-Key': CALORIE_NINJAS_API_KEY}
        url = f"https://api.calorieninjas.com/v1/nutrition?query={eng_query}"
        response = requests.get(url, headers=headers, timeout=10)
        data = response.json()
        
        products = []
        if 'items' in data:
            for item in data['items']:
                products.append({
                    "product_name": item.get('name', 'Неизвестно'),
                    "image_url": "",
                    "calories_100g": item.get('calories', 0),
                    "proteins_100g": item.get('protein_g', 0),
                    "fat_100g": item.get('fat_total_g', 0),
                    "carbs_100g": item.get('carbohydrates_total_g', 0),
                    "ingredients": "Данные CalorieNinjas",
                    "description": ""
                })
        return jsonify({"products": products})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"products": []})

def translate_to_english(word):
    # Простой словарь для популярных продуктов
    dictionary = {
        'йогурт': 'yogurt',
        'яблоко': 'apple',
        'банан': 'banana',
        'молоко': 'milk',
        'хлеб': 'bread',
        'курица': 'chicken',
        'рис': 'rice',
        'яйцо': 'egg',
        'сыр': 'cheese',
        'мясо': 'meat',
        'рыба': 'fish',
        'овсянка': 'oatmeal',
        'творог': 'cottage cheese',
        'сок': 'juice',
        'вода': 'water',
        'кофе': 'coffee',
        'чай': 'tea',
        'шоколад': 'chocolate',
        'печенье': 'cookie',
        'макароны': 'pasta',
        'картофель': 'potato',
        'помидор': 'tomato',
        'огурец': 'cucumber'
    }
    return dictionary.get(word.lower(), word)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
