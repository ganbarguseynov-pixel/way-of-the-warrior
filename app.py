from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os
import requests
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

HF_TOKEN = os.environ.get("HF_TOKEN")
LOGMEAL_TOKEN = os.environ.get("LOGMEAL_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Настраиваем Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@app.route('/search', methods=['GET'])
def search_food():
    query = request.args.get('q')
    if not query:
        return jsonify({"error": "No query provided"}), 400
    try:
        response = requests.get(f"https://www.getdietly.com/api/search?q={query}", timeout=10)
        return jsonify(response.json()) if response.status_code == 200 else jsonify({"error": "DietlyAPI error"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- ПРОВЕРКА GEMINI ---
@app.route('/check_gemini', methods=['GET'])
def check_gemini():
    if not GEMINI_API_KEY:
        return "ОШИБКА: Ключ Gemini не найден в настройках сервера", 500
    try:
        # Используем модель, которую рекомендует сам Google
        model = genai.GenerativeModel('gemini-3.8-flash')
        response = model.generate_content("Напиши ровно одно слово: РАБОТАЕТ")
        return f"УСПЕХ! Gemini ответил: {response.text}"
    except Exception as e:
        return f"ОШИБКА GEMINI: {str(e)}", 500
# -----------------------------

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

    # 1. Пытаемся использовать LogMeal
    if LOGMEAL_TOKEN:
        try:
            files = {'image': ('food.jpg', img_byte_arr, 'image/jpeg')}
            headers = {'Authorization': f'Bearer {LOGMEAL_TOKEN}'}
            lm_response = requests.post('https://api.logmeal.es/v2/image/recognition/complete', headers=headers, files=files, timeout=30)
            if lm_response.status_code == 200:
                lm_data = lm_response.json()
                if 'recognition_results' in lm_data and len(lm_data['recognition_results']) > 0:
                    return jsonify({"food": lm_data['recognition_results'][0]['name'], "calories": 250, "protein": 15, "fat": 10, "carbs": 30})
        except Exception as e:
            print(f"LogMeal error: {e}")

    # 2. Если LogMeal не сработал, пробуем Gemini
    if GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel('gemini-3.8-flash')
            prompt = "What food is in this image? Answer in one short phrase in Russian. Also estimate calories, protein, fat, and carbs. Format: Food name | Calories | Protein | Fat | Carbs"
            response = model.generate_content([prompt, image])
            text = response.text.strip()
            
            # Простой парсинг ответа
            parts = [p.strip() for p in text.split('|')]
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
