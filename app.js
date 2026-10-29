const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
// Отключаем сохранение сессии, чтобы не было зависаний
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

window.addEventListener('load', () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    }
});

// --- ЛОГИКА ВХОДА ---
function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        // Просто показываем главный экран, так как Telegram уже дал нам данные
        if (localStorage.getItem('cachedProfile')) {
            renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        } else {
            openScreen('profile-settings-screen');
        }
    } else {
        tg.showAlert("Пожалуйста, откройте приложение через Telegram!");
    }
}

function showEmailForm() {
    openScreen('email-screen');
}

async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('email-submit-btn');

    if (!email || !password) { tg.showAlert("Заполните все поля!"); return; }

    btn.innerText = "Загрузка...";
    btn.disabled = true;

    try {
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (signInError) {
            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
            if (signUpError) { 
                tg.showAlert("Ошибка: " + signUpError.message); 
            } else { 
                tg.showAlert("Регистрация успешна! Теперь войдите."); 
            }
        } else {
            tg.showAlert("Успешный вход!");
            // Создаем локальный профиль для Email-пользователя
            const emailProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(emailProfile));
            renderProfile(emailProfile);
        }
    } catch (e) {
        tg.showAlert("Ошибка сети. Попробуйте позже.");
    } finally {
        btn.innerText = "Продолжить";
        btn.disabled = false;
    }
}

// --- ОСТАЛЬНАЯ ЛОГИКА (ПРОФИЛЬ, МУЗЫКА, РЕЙТИНГ) ---
const levelsData = {
    male: [
        { xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" },
        { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" },
        { xp: 250, title: "Легионер", video: "VID_20261028_162626_544.mp4" },
        { xp: 500, title: "Титан", video: "VID_20261028_173219_295.mp4" }
    ],
    female: [
        { xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" },
        { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" },
        { xp: 250, title: "Амазонка", video: "VID_20261028_175641_349.mp4" },
        { xp: 500, title: "Гарпия", video: "VID_20261028_175649_029.mp4" }
    ]
};

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male';

function openProfileSettings() { openScreen('profile-settings-screen'); }

function openScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function closeScreen(screenId) {
    document.getElementById(screenId).classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
}

function renderProfile(profile) {
    userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';
    
    let bmr = userGender === 'male' ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5) : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    let cals = profile.goal === 'lose' ? (bmr * 1.375 - 500) : (bmr * 1.375 + 500);
    
    if (document.getElementById('calories-norm')) {
        document.getElementById('calories-norm').innerText = Math.round(cals) + " ккал";
    }

    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);
    
    if (document.getElementById('burned-total')) {
        document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    }
    
    updateCharacterUI();
    
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('dashboard-screen').classList.add('active');
}

function updateCharacterUI() {
    const levels = levelsData[userGender];
    let newLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
    
    const currentLevel = levels[newLevelIndex];
    const nextLevel = levels[newLevelIndex + 1] || levels[levels.length - 1];
    const videoElement = document.getElementById('character-video');

    if (videoElement && videoElement.src.indexOf(currentLevel.video) === -1) {
        videoElement.src = currentLevel.video;
        videoElement.load();
        videoElement.play().catch(e => console.log("Autoplay blocked"));
    }

    if (document.getElementById('char-level')) document.getElementById('char-level').innerText = "Уровень " + (newLevelIndex + 1);
    if (document.getElementById('char-title')) document.getElementById('char-title').innerText = currentLevel.title;

    let progressPercent = 100;
    if (nextLevel.xp > currentLevel.xp) {
        progressPercent = ((currentXP - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100;
        if (document.getElementById('xp-text')) document.getElementById('xp-text').innerText = currentXP + " / " + nextLevel.xp + " XP";
    } else {
        if (document.getElementById('xp-text')) document.getElementById('xp-text').innerText = currentXP + " XP (MAX)";
    }
    if (document.getElementById('xp-bar')) document.getElementById('xp-bar').style.width = progressPercent + "%";
}

function saveProfile() {
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const weight = document.getElementById('weight').value;
    const height = document.getElementById('height').value;
    const goal = document.getElementById('goal').value;
    
    if (!age || !weight || !height) { tg.showAlert("Заполни все поля!"); return; }
    
    const profile = { age: age, gender: gender, weight: weight, height: height, goal: goal };
    localStorage.setItem('cachedProfile', JSON.stringify(profile));
    
    renderProfile(profile);
}

function logout() {
    localStorage.clear();
    location.reload();
}
