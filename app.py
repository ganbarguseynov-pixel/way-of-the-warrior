from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")

# Функция для проверки, есть ли русские буквы в тексте
def is_russian(text):
    return any('а' <= char.lower() <= 'я' for char in text)

# Функция для перевода на русский
def translate_to_russian(text):
    if is_russian(text):
        return text  # Если уже на русском, ничего не переводим
    
    try:
        # Используем бесплатный API Google Translate (без ключа)
        url = "https://translate.googleapis.com/translate_a/single"
        params = {
            "client": "gtx",
            "sl": "auto",
            "tl": "ru",
            "dt": "t",
            "q": text
        }
        response = requests.get(url, params=params, timeout=5)
        if response.status_code == 200:
            translated = response.json()[0][0][0]
            return translated
    except Exception as e:
        print(f"Translate error: {e}")
    
    return text  # Если перевод не удался, возвращаем оригинал

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q')
    if not query:
        return jsonify({"error": "No query provided"}), 400
    try:
        response = requests.get(f"https://www.getdietly.com/api/search?q={query}", timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Переводим названия продуктов на русский
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

    # Используем LogMeal для распознавания
    if LOGMEAL_TOKEN:
        try:
            files = {'image': ('food.jpg', img_byte_arr, 'image/jpeg')}
            headers = {'Authorization': f'Bearer {LOGMEAL_TOKEN}'}
            lm_response = requests.post('https://api.logmeal.es/v2/image/recognition/complete', headers=headers, files=files, timeout=30)
            if lm_response.status_code == 200:
                lm_data = lm_response.json()
                if 'recognition_results' in lm_data and len(lm_data['recognition_results']) > 0:
                    food_name = lm_data['recognition_results'][0]['name']
                    # Переводим название еды с фото на русский
                    food_name_ru = translate_to_russian(food_name)
                    return jsonify({"food": food_name_ru, "calories": 250, "protein": 15, "fat": 10, "carbs": 30})
        except Exception as e:
            print(f"LogMeal error: {e}")

    return jsonify({"food": "Не удалось распознать", "calories": 0, "protein": 0, "fat": 0, "carbs": 0})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
