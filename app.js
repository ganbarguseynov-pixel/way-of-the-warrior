const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

function openScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
}
function closeScreen(screenId) {
    document.getElementById(screenId).classList.remove('active');
    if (localStorage.getItem('cachedProfile')) {
        document.getElementById('dashboard-screen').classList.add('active');
    } else {
        document.getElementById('auth-screen').classList.add('active');
    }
}

window.addEventListener('load', async () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    } else {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            localStorage.setItem('loginType', 'email');
            localStorage.setItem('currentEmail', session.user.email);
            await syncProgressFromCloud(session.user.email, null);
        }
    }
});

// (Функции авторизации loginWithTelegram, handleEmailAuth и т.д. оставь из старого кода)
// ... 

const levelsData = {
male: [{ xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" }, { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" }],
female: [{ xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" }, { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" }]
};

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male';
let currentProfileData = null;

function calculateNutrition(profile) {
    let bmr = profile.gender === 'male' 
        ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5)
        : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    
    let tdee = bmr * 1.375;
    if (profile.goal === 'lose') tdee -= 500;
    if (profile.goal === 'gain') tdee += 500;
    
    let protein = Math.round((tdee * 0.30) / 4);
    let fat = Math.round((tdee * 0.30) / 9);
    let carbs = Math.round((tdee * 0.40) / 4);

    return { calories: Math.round(tdee), protein, fat, carbs };
}

function updateDashboard() {
    if (!currentProfileData) return;
    
    const norm = calculateNutrition(currentProfileData);
    
    if (document.getElementById('norm-cal')) {
        document.getElementById('norm-cal').innerText = norm.calories;
        document.getElementById('norm-prot').innerText = norm.protein;
        document.getElementById('norm-fat').innerText = norm.fat;
        document.getElementById('norm-carb').innerText = norm.carbs;
    }

    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    let eatenCal = 0, eatenProt = 0, eatenFat = 0, eatenCarb = 0;
    
    todayFood.forEach(food => {
        eatenCal += parseFloat(food.calories_100g || 0);
        eatenProt += parseFloat(food.proteins_100g || 0);
        eatenFat += parseFloat(food.fat_100g || 0);
        eatenCarb += parseFloat(food.carbs_100g || 0);
    });

    if (document.getElementById('eaten-cal')) {
        document.getElementById('eaten-cal').innerText = Math.round(eatenCal);
        document.getElementById('eaten-prot').innerText = Math.round(eatenProt);
        document.getElementById('eaten-fat').innerText = Math.round(eatenFat);
        document.getElementById('eaten-carb').innerText = Math.round(eatenCarb);
    }

    renderTodayFoodList(todayFood); // Вызываем отрисовку списка
}

function renderTodayFoodList(todayFood) {
    const listDiv = document.getElementById('today-food-list');
    if (!listDiv) return;

    if (todayFood.length === 0) {
        listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; font-size: 12px;">Пока ничего не съедено</p>';
        return;
    }

    let html = '';
    todayFood.forEach((food, index) => {
        html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; background: #2c2c2e; padding: 5px 10px; border-radius: 8px;">
            <div style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">
                ${food.product_name}
            </div>
            <button onclick="deleteFoodItem(${index})" style="background: none; border: none; color: #ff3b30; font-size: 16px; cursor: pointer; padding: 0 5px;">✖</button>
        </div>
        `;
    });
    listDiv.innerHTML = html;
}

function deleteFoodItem(index) {
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    todayFood.splice(index, 1); // Удаляем 1 элемент по индексу
    localStorage.setItem('todayFood', JSON.stringify(todayFood));
    updateDashboard(); // Пересчитываем цифры
}

function clearTodayFood() {
    if (confirm("Очистить весь список съеденного за сегодня?")) {
        localStorage.setItem('todayFood', '[]');
        updateDashboard();
    }
}

function renderProfile(profile) {
    currentProfileData = profile;
    userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';

    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);

    const pendingXP = parseInt(localStorage.getItem('pendingXP') || 0);
    if (pendingXP > 0) {
        currentXP += pendingXP;
        localStorage.setItem('cachedXP', currentXP);
        localStorage.removeItem('pendingXP');
        saveProgressToCloud(null, null, null, profile, currentXP, totalBurnedCalories);
    }

    if (document.getElementById('burned-total')) document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    
    updateDashboard();
    updateCharacterUI();
    openScreen('dashboard-screen');
}

// (Функции updateCharacterUI, openProfileSettings, saveProfile и т.д. оставь из старого кода)
