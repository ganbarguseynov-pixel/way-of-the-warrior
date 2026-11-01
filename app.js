const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

// Твой email для жесткой привязки
const MY_EMAIL = "ganbarguseynov@gmail.com";

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
        await syncFoodFromCloud();
    }
});

async function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const tgId = tg.initDataUnsafe.user.id;
        localStorage.setItem('tgId', tgId);
        localStorage.setItem('userName', tg.initDataUnsafe.user.first_name || "Атлет");
        localStorage.setItem('linkedEmail', MY_EMAIL);
        
        // Загружаем профиль именно по твоему email
        const { data } = await supabaseClient.from('user_links').select('*').eq('email', MY_EMAIL).maybeSingle();
        
        if (data && data.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
            localStorage.setItem('cachedXP', data.xp || 0);
            localStorage.setItem('cachedBurned', data.burned || 0);
            if (data.food) localStorage.setItem('todayFood', JSON.stringify(data.food));
            if (data.name) localStorage.setItem('userName', data.name);
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            await saveProgressToCloud(tgId, MY_EMAIL, "Атлет", defaultProfile, 0, 0);
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
    } else {
        tg.showAlert("Откройте через Telegram!");
    }
}

function showEmailForm() { openScreen('email-screen'); }

async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) { tg.showAlert("Заполните все поля!"); return; }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { tg.showAlert("Ошибка: " + error.message); return; }

    localStorage.setItem('currentEmail', email);
    localStorage.setItem('userName', email.split('@')[0]);

    const { data } = await supabaseClient.from('user_links').select('*').eq('email', email).maybeSingle();
    if (data && data.profile) {
        localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
        localStorage.setItem('cachedXP', data.xp || 0);
        localStorage.setItem('cachedBurned', data.burned || 0);
        if (data.food) localStorage.setItem('todayFood', JSON.stringify(data.food));
    }
    renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
}

// --- СИНХРОНИЗАЦИЯ СТРОГО ПО ТВОЕМУ EMAIL ---
async function syncFoodFromCloud() {
    const { data } = await supabaseClient.from('user_links').select('food').eq('email', MY_EMAIL).maybeSingle();
    if (data && data.food) {
        localStorage.setItem('todayFood', JSON.stringify(data.food));
        updateDashboard();
    }
}

async function saveFoodToCloud(foodArray) {
    const { data } = await supabaseClient.from('user_links').select('id').eq('email', MY_EMAIL).maybeSingle();
    if (data) {
        await supabaseClient.from('user_links').update({ food: foodArray }).eq('id', data.id);
    }
}
// ----------------------------------------------

async function saveProgressToCloud(tgId, email, name, profile, xp, burned) {
    let existingId = null;
    const { data } = await supabaseClient.from('user_links').select('id').eq('email', email).maybeSingle();
    if (data) existingId = data.id;

    if (existingId) {
        await supabaseClient.from('user_links').update({ profile: profile, xp: xp, burned: burned, name: name, telegram_id: tgId || null }).eq('id', existingId);
    } else {
        await supabaseClient.from('user_links').insert([{ telegram_id: tgId, email: email, profile: profile, xp: xp, burned: burned, name: name }]);
    }
}

const levelsData = {
    male: [{ xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" }, { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" }],
    female: [{ xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" }, { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" }]
};

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male';
let currentProfileData = null;

function calculateNutrition(profile) {
    if (profile.custom_calories && profile.custom_calories > 0) {
        return { calories: parseInt(profile.custom_calories), protein: parseInt(profile.custom_protein) || 0, fat: parseInt(profile.custom_fat) || 0, carbs: parseInt(profile.custom_carbs) || 0 };
    }
    let bmr = profile.gender === 'male' ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5) : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    let tdee = bmr * 1.375;
    if (profile.goal === 'lose') tdee -= 500;
    if (profile.goal === 'gain') tdee += 500;
    return { calories: Math.round(tdee), protein: Math.round((tdee * 0.30) / 4), fat: Math.round((tdee * 0.30) / 9), carbs: Math.round((tdee * 0.40) / 4) };
}

function checkDayReset() {
    const now = new Date();
    const today = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    if (localStorage.getItem('foodListDate') !== today) {
        localStorage.setItem('todayFood', '[]');
        localStorage.setItem('foodListDate', today);
        saveFoodToCloud([]);
    }
}

function updateDashboard() {
    if (!currentProfileData) return;
    checkDayReset();
    const norm = calculateNutrition(currentProfileData);
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    let eatenCal = 0, eatenProt = 0, eatenFat = 0, eatenCarb = 0;
    todayFood.forEach(food => {
        eatenCal += parseFloat(food.calories_100g || 0);
        eatenProt += parseFloat(food.proteins_100g || 0);
        eatenFat += parseFloat(food.fat_100g || 0);
        eatenCarb += parseFloat(food.carbs_100g || 0);
    });
    if (document.getElementById('norm-cal')) {
        document.getElementById('norm-cal').innerText = norm.calories;
        document.getElementById('norm-prot').innerText = norm.protein;
        document.getElementById('norm-fat').innerText = norm.fat;
        document.getElementById('norm-carb').innerText = norm.carbs;
    }
    const setValue = (id, eaten, normVal) => {
        const el = document.getElementById(id);
        if (el) { el.innerText = Math.round(eaten); el.style.color = (eaten > normVal) ? '#ff3b30' : '#fff'; }
    };
    setValue('eaten-cal', eatenCal, norm.calories);
    setValue('eaten-prot', eatenProt, norm.protein);
    setValue('eaten-fat', eatenFat, norm.fat);
    setValue('eaten-carb', eatenCarb, norm.carbs);
    renderTodayFoodList(todayFood);
}

function renderTodayFoodList(todayFood) {
    const listDiv = document.getElementById('today-food-list');
    if (!listDiv) return;
    if (todayFood.length === 0) { listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не съедено</p>'; return; }
    let html = '';
    todayFood.forEach((food, index) => {
        html += `<div class="compact-food-item"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 85%;">${food.product_name}</div><button onclick="deleteFoodItem(${index})" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>`;
    });
    listDiv.innerHTML = html;
}

function deleteFoodItem(index) {
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    todayFood.splice(index, 1);
    localStorage.setItem('todayFood', JSON.stringify(todayFood));
    saveFoodToCloud(todayFood);
    updateDashboard();
}

function clearTodayFood() {
    if (confirm("Очистить весь список съеденного за сегодня?")) {
        localStorage.setItem('todayFood', '[]');
        saveFoodToCloud([]);
        updateDashboard();
    }
}

function openCustomNormModal() {
    if (!currentProfileData) return;
    document.getElementById('modal-calories').value = currentProfileData.custom_calories || '';
    document.getElementById('modal-protein').value = currentProfileData.custom_protein || '';
    document.getElementById('modal-fat').value = currentProfileData.custom_fat || '';
    document.getElementById('modal-carbs').value = currentProfileData.custom_carbs || '';
    document.getElementById('norm-modal').classList.add('active');
}

function closeCustomNormModal() { document.getElementById('norm-modal').classList.remove('active'); }

function saveCustomNormFromModal() {
    if (!currentProfileData) return;
    currentProfileData.custom_calories = document.getElementById('modal-calories').value;
    currentProfileData.custom_protein = document.getElementById('modal-protein').value;
    currentProfileData.custom_fat = document.getElementById('modal-fat').value;
    currentProfileData.custom_carbs = document.getElementById('modal-carbs').value;
    localStorage.setItem('cachedProfile', JSON.stringify(currentProfileData));
    saveProgressToCloud(localStorage.getItem('tgId'), MY_EMAIL, localStorage.getItem('userName'), currentProfileData, currentXP, totalBurnedCalories);
    updateDashboard();
    closeCustomNormModal();
}

function renderProfile(profile) {
    currentProfileData = profile;
    userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';
    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);
    if (document.getElementById('burned-total')) document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    updateDashboard();
    updateCharacterUI();
    openScreen('dashboard-screen');
    setTimeout(() => {
        const videoElement = document.getElementById('character-video');
        if (videoElement) {
            const levels = levelsData[userGender];
            let newLevelIndex = 0;
            for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
            const currentLevel = levels[newLevelIndex];
            if (videoElement.src.indexOf(currentLevel.video) === -1) {
                videoElement.src = currentLevel.video;
                videoElement.load();
                videoElement.play().catch(e => console.log("Autoplay blocked"));
            }
        }
    }, 1000);
}

function updateCharacterUI() {
    const levels = levelsData[userGender];
    let newLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
    const currentLevel = levels[newLevelIndex];
    if (document.getElementById('char-level')) document.getElementById('char-level').innerText = "Уровень " + (newLevelIndex + 1);
    if (document.getElementById('char-title')) document.getElementById('char-title').innerText = currentLevel.title;
    if (document.getElementById('xp-text')) document.getElementById('xp-text').innerText = currentXP + " XP";
    let nextLevelXp = 100;
    if (newLevelIndex + 1 < levels.length) nextLevelXp = levels[newLevelIndex + 1].xp;
    let percent = (currentXP / nextLevelXp) * 100;
    if (percent > 100) percent = 100;
    if (document.getElementById('xp-bar')) document.getElementById('xp-bar').style.width = percent + "%";
}

function openProfileSettings() {
    const p = JSON.parse(localStorage.getItem('cachedProfile') || '{}');
    document.getElementById('age').value = p.age || '';
    document.getElementById('weight').value = p.weight || '';
    document.getElementById('height').value = p.height || '';
    document.getElementById('gender').value = p.gender || 'male';
    document.getElementById('goal').value = p.goal || 'lose';
    document.getElementById('custom-calories').value = p.custom_calories || '';
    document.getElementById('custom-protein').value = p.custom_protein || '';
    document.getElementById('custom-fat').value = p.custom_fat || '';
    document.getElementById('custom-carbs').value = p.custom_carbs || '';
    openScreen('profile-settings-screen');
}

async function saveProfile() {
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const weight = document.getElementById('weight').value;
    const height = document.getElementById('height').value;
    const goal = document.getElementById('goal').value;
    const custom_calories = document.getElementById('custom-calories').value;
    const custom_protein = document.getElementById('custom-protein').value;
    const custom_fat = document.getElementById('custom-fat').value;
    const custom_carbs = document.getElementById('custom-carbs').value;
    if (!age || !weight || !height) { tg.showAlert("Заполни все поля!"); return; }
    const profile = { age, gender, weight, height, goal, custom_calories, custom_protein, custom_fat, custom_carbs };
    localStorage.setItem('cachedProfile', JSON.stringify(profile));
    await saveProgressToCloud(localStorage.getItem('tgId'), MY_EMAIL, localStorage.getItem('userName'), profile, currentXP, totalBurnedCalories);
    renderProfile(profile);
    tg.showAlert("Данные сохранены!");
}

async function logout() {
    if (confirm("Выйти из аккаунта?")) { localStorage.clear(); await supabaseClient.auth.signOut(); location.reload(); }
}

let isShakeTesting = false; let maxShakeValue = 0;
async function startShakeTest() {
    if (isShakeTesting) return;
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { const permission = await DeviceMotionEvent.requestPermission(); if (permission !== 'granted') { tg.showAlert("Нет доступа."); return; } } catch (e) { return; }
    }
    isShakeTesting = true; maxShakeValue = 0;
    document.getElementById('test-shake-btn').style.display = 'none'; document.getElementById('stop-shake-btn').style.display = 'block';
    window.addEventListener('devicemotion', function(event) {
        if (!isShakeTesting) return;
        const acc = event.accelerationIncludingGravity;
        if (acc) { const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0); if (Math.round(force) > maxShakeValue) maxShakeValue = Math.round(force); }
    });
    tg.showAlert("Тряси телефон!");
}
function stopShakeTest() { isShakeTesting = false; document.getElementById('test-shake-btn').style.display = 'block'; document.getElementById('stop-shake-btn').style.display = 'none'; tg.showAlert("Максимум: " + maxShakeValue); }
