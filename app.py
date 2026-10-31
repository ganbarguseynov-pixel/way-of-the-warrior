from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import json

app = Flask(__name__)
CORS(app)

LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

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

# --- ГЛОБАЛЬНЫЙ ПОИСК ЧЕРЕЗ GEMINI (МОДЕЛЬ 2.5-FLASH) ---
@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q', '').strip()
    if not query or not GEMINI_API_KEY:
        return jsonify({"products": []})
    
    try:
        # Используем АКТУАЛЬНУЮ модель gemini-2.5-flash
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        
        prompt = f"""
        Ты — эксперт по питанию. Пользователь ищет продукт: "{query}".
        Найди точные данные о пищевой ценности этого продукта на 100 грамм.
        Верни ответ СТРОГО в формате JSON (без markdown, без лишнего текста):
        {{"name": "Название продукта на русском", "calories": 100, "protein": 10, "fat": 5, "carbs": 20}}
        Если продукт не найден или это не еда, верни {{"name": "НЕТ"}}.
        """
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        
        response = requests.post(url, json=payload, timeout=20)
        data = response.json()
        
        if 'error' in data:
            print(f"Google API Error: {data['error']}")
            return jsonify({"products": []})
        
        text = data['candidates'][0]['content']['parts'][0]['text']
        text = text.replace('```json', '').replace('```', '').strip()
        result = json.loads(text)
        
        if result.get("name") == "НЕТ":
            return jsonify({"products": []})
            
        return jsonify({"products": [{
            "product_name": result.get("name"),
            "image_url": "",
            "calories_100g": result.get("calories", 0),
            "proteins_100g": result.get("protein", 0),
            "fat_100g": result.get("fat", 0),
            "carbs_100g": result.get("carbs", 0),
            "ingredients": f"Данные ИИ для: {query}",
            "description": ""
        }]})
    except Exception as e:
        print(f"Search error: {e}")
        return jsonify({"products": []})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
