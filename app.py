from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
import os

app = Flask(__name__)
CORS(app)  # Вот эта строчка разрешает Telegram общаться с сервером

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    file = request.files['image']
    try:
        image = Image.open(io.BytesIO(file.read())).convert("RGB")
    except:
        return jsonify({"error": "Invalid image"}), 400
    
    # Пока это тестовые данные (ИИ-модель добавим позже)
    return jsonify({
        "food": "Куриная грудка с рисом",
        "calories": 450,
        "protein": 35,
        "fat": 12,
        "carbs": 45
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
