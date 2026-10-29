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

# Словарь для популярных продуктов
RU_DICT = {
    "apple": "яблоко", "banana": "банан", "cauliflower": "цветная капуста", 
    "chicken": "курица", "beef": "говядина", "pork": "свинина", 
    "rice": "рис", "bread": "хлеб", "egg": "яйцо", "cheese": "сыр",
    "tomato": "помидор", "cucumber": "огурец", "potato": "картофель",
    "salad": "салат", "fish": "рыба", "milk": "молоко", "water": "вода",
    "broccoli": "брокколи", "carrot": "морковь", "onion": "лук"
}

def translate_to_russian(text):
    if not text:
        return text
    
    # 1. Если уже на русском - не трогаем
    if any('а' <= char.lower() <= 'я' for char in text):
        return text
        
    # 2. Защита от никнеймов: если есть цифры, спецсимволы или это одно длинное слово без пробелов - не переводим
    if re.search(r'[0-9_@#\$%^&*!]', text) or (len(text.split()) == 1 and len(text) > 15):
        return text
        
    text_lower = text.lower()
    # 3. Проверяем словарь
    if text_lower in RU_DICT:
        return RU_DICT[text_lower]
    
    # 4. Пытаемся перевести через Google
    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = {"client": "gtx", "sl": "auto", "tl": "ru", "dt": "t", "q": text}
        response = requests.get(url, params=params, timeout=3)
        if response.status_code == 200:
            return response.json()[0][0][0]
    except Exception as e:
        print(f"Translate error: {e}")
    
    return text

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q')
    if not query:
        return jsonify({"error": "No query provided"}), 400
    try:
        response = requests.get(f"https://www.getdietly.com/api/search?q={query}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                for item in data:
                    if 'name' in item:
                        item['name'] = translate_to_russian(item['name'])
            elif isinstance(data, dict) and 'results' in data:
                for item in data['results']:
                    if 'name' in item:
                        item['name'] = translate_to_russian(item['name'])
            return jsonify(data)
        return jsonify({"error": "DietlyAPI error"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze_photo():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    file = request.files['image']
    try:
        image = Image.open(io.BytesIO(file.read())).convert("RGB")
    except:
        return jsonify({"error": "Invalid image"}), 400
    
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='JPEG')
    img_byte_arr = img_byte_arr.getvalue()

    if LOGMEAL_TOKEN:
        try:
            files = {'image': ('food.jpg', img_byte_arr, 'image/jpeg')}
            headers = {'Authorization': f'Bearer {LOGMEAL_TOKEN}'}
            lm_response = requests.post('https://api.logmeal.es/v2/image/recognition/complete', headers=headers, files=files, timeout=30)
            if lm_response.status_code == 200:
                lm_data = lm_response.json()
                if 'recognition_results' in lm_data and len(lm_data['recognition_results']) > 0:
                    food_name = lm_data['recognition_results'][0]['name']
                    food_name_ru = translate_to_russian(food_name)
                    return jsonify({"food": food_name_ru, "calories": 250, "protein": 15, "fat": 10, "carbs": 30})
        except Exception as e:
            print(f"LogMeal error: {e}")

    return jsonify({"food": "Не удалось распознать", "calories": 0, "protein": 0, "fat": 0, "carbs": 0})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
