from flask import Flask, request, jsonify
from PIL import Image
import io
import os

app = Flask(__name__)

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    file = request.files['image']
    image = Image.open(io.BytesIO(file.read())).convert("RGB")
    
    return jsonify({
        "food": "Куриная грудка",
        "calories": 165,
        "protein": 31,
        "fat": 3.6,
        "carbs": 0
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
