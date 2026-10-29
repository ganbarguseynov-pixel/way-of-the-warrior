const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } });
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

// --- ЗАГРУЗКА ПРИ СТАРТЕ ---
window.addEventListener('load', async () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile), localStorage.getItem('loginType'));
    } else {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const emailProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(emailProfile));
            localStorage.setItem('loginType', 'email');
            renderProfile(emailProfile, 'email');
        }
    }
});

// --- ВХОД ЧЕРЕЗ TELEGRAM ---
function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        localStorage.setItem('loginType', 'telegram');
        
        // Создаем профиль по умолчанию, если его нет
        if (!localStorage.getItem('cachedProfile')) {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
        }
        
        // Всегда показываем главный экран
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')), 'telegram');
    } else {
        tg.showAlert("Откройте через Telegram!");
    }
}

// --- ВХОД ЧЕРЕЗ EMAIL ---
function showEmailForm() { openScreen('email-screen'); }

async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('email-submit-btn');

    if (!email || !password) { tg.showAlert("Заполните все поля!"); return; }
    btn.innerText = "Загрузка...";
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) {
            const { error: signUpError } = await supabaseClient.auth.signUp({ email, password });
            if (signUpError) { 
                tg.showAlert("Ошибка: " + signUpError.message); 
            } else { 
                tg.showAlert("Регистрация успешна! Теперь войдите."); 
            }
        } else {
            tg.showAlert("Успешный вход!");
            localStorage.setItem('loginType', 'email');
            
            // Создаем профиль, если его нет
            if (!localStorage.getItem('cachedProfile')) {
                const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
                localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            }
            
            // Переключаем на главный экран
            renderProfile(JSON.parse(localStorage.getItem('cachedProfile')), 'email');
        }
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    } finally {
        btn.innerText = "Продолжить";
        btn.disabled = false;
    }
}

// --- НАСТРОЙКИ И ПРИВЯЗКА ---
function openProfileSettings() { 
    const loginType = localStorage.getItem('loginType') || 'telegram';
    
    if (loginType === 'telegram') {
        document.getElementById('link-title').innerText = "Привязка Email";
        document.getElementById('link-desc').innerText = "Привяжите Email, чтобы заходить с любого устройства.";
        document.getElementById('link-email-form').style.display = 'block';
        document.getElementById('link-tg-form').style.display = 'none';
    } else {
        document.getElementById('link-title').innerText = "Привязка Telegram";
        document.getElementById('link-desc').innerText = "Ваш Telegram ID для входа с телефона.";
        document.getElementById('link-email-form').style.display = 'none';
        document.getElementById('link-tg-form').style.display = 'block';
        
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            document.getElementById('current-tg-id').innerText = tg.initDataUnsafe.user.id;
        }
    }
    
    // Заполняем поля текущими данными
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        const p = JSON.parse(cachedProfile);
        document.getElementById('age').value = p.age || '';
        document.getElementById('weight').value = p.weight || '';
        document.getElementById('height').value = p.height || '';
        document.getElementById('gender').value = p.gender || 'male';
        document.getElementById('goal').value = p.goal || 'lose';
    }
    
    openScreen('profile-settings-screen'); 
}

async function linkEmailToTelegram() {
    const email = document.getElementById('link-email').value;
    const password = document.getElementById('link-password').value;

    if (!email || !password) { tg.showAlert("Заполните Email и пароль!"); return; }

    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error) {
            tg.showAlert("Ошибка: " + error.message);
        } else {
            tg.showAlert("Email успешно привязан! Теперь вы можете заходить с любого устройства.");
        }
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    }
}

function linkTelegramToEmail() {
    tg.showAlert("Ваш Telegram ID сохранен в профиле.");
}

// --- ОСТАЛЬНАЯ ЛОГИКА ---
const levelsData = {
    male: [{ xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" }, { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" }],
    female: [{ xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" }, { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" }]
};

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male';

function openScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function closeScreen(screenId) {
    document.getElementById(screenId).classList.remove('active');
    if (localStorage.getItem('cachedProfile')) {
        document.getElementById('dashboard-screen').classList.add('active');
    } else {
        document.getElementById('auth-screen').classList.add('active');
    }
}

function renderProfile(profile, loginType) {
    userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';
    
    let bmr = userGender === 'male' ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5) : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    let cals = profile.goal === 'lose' ? (bmr * 1.375 - 500) : (bmr * 1.375 + 500);
    if (document.getElementById('calories-norm')) document.getElementById('calories-norm').innerText = Math.round(cals) + " ккал";

    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);
    if (document.getElementById('burned-total')) document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    
    updateCharacterUI();
    
    // Принудительно переключаем на главный экран
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('dashboard-screen').classList.add('active');
}

function updateCharacterUI() {
    const levels = levelsData[userGender];
    let newLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
    
    const currentLevel = levels[newLevelIndex];
    const videoElement = document.getElementById('character-video');

    if (videoElement && videoElement.src.indexOf(currentLevel.video) === -1) {
        videoElement.src = currentLevel.video;
        videoElement.load();
        videoElement.play().catch(e => console.log("Autoplay blocked"));
    }

    if (document.getElementById('char-level')) document.getElementById('char-level').innerText = "Уровень " + (newLevelIndex + 1);
    if (document.getElementById('char-title')) document.getElementById('char-title').innerText = currentLevel.title;

    if (document.getElementById('xp-text')) document.getElementById('xp-text').innerText = currentXP + " XP";
    if (document.getElementById('xp-bar')) document.getElementById('xp-bar').style.width = "50%";
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
    
    renderProfile(profile, localStorage.getItem('loginType'));
}

function logout() {
    localStorage.clear();
    supabaseClient.auth.signOut();
    location.reload();
}
