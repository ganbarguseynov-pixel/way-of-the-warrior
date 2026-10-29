const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand(); 

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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

// --- ГЛАВНАЯ ФУНКЦИЯ СОХРАНЕНИЯ ---
async function saveProgressToCloud() {
    try {
        let tgId = localStorage.getItem('tgId');
        let email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
        let name = localStorage.getItem('userName') || "Атлет";
        let profile = JSON.parse(localStorage.getItem('cachedProfile'));
        let xp = parseInt(localStorage.getItem('cachedXP') || 0);
        let burned = parseInt(localStorage.getItem('cachedBurned') || 0);

        if (!tgId && !email) return;

        let existingId = null;
        if (tgId) {
            const { data } = await supabaseClient.from('user_links').select('id').eq('telegram_id', tgId).maybeSingle();
            if (data) existingId = data.id;
        }
        if (!existingId && email) {
            const { data } = await supabaseClient.from('user_links').select('id').eq('email', email).maybeSingle();
            if (data) existingId = data.id;
        }

        if (existingId) {
            await supabaseClient.from('user_links').update({
                telegram_id: tgId, email: email, name: name, profile: profile, xp: xp, burned: burned
            }).eq('id', existingId);
        } else {
            await supabaseClient.from('user_links').insert([{
                telegram_id: tgId, email: email, name: name, profile: profile, xp: xp, burned: burned
            }]);
        }
    } catch (e) {
        console.log("Ошибка сохранения:", e);
    }
} 

// --- ЗАГРУЗКА ПРИ СТАРТЕ ---
window.addEventListener('load', async () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    } else {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            localStorage.setItem('loginType', 'email');
            localStorage.setItem('currentEmail', session.user.email);
            const { data } = await supabaseClient.from('user_links').select('*').eq('email', session.user.email).maybeSingle();
            if (data) {
                if (data.telegram_id) localStorage.setItem('tgId', data.telegram_id);
                if (data.name) localStorage.setItem('userName', data.name);
                localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
                localStorage.setItem('cachedXP', data.xp || 0);
                localStorage.setItem('cachedBurned', data.burned || 0);
                renderProfile(data.profile);
            }
        }
    }
}); 

// --- ВХОД ЧЕРЕЗ TELEGRAM ---
async function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        localStorage.setItem('loginType', 'telegram');
        const tgId = tg.initDataUnsafe.user.id;
        const tgName = tg.initDataUnsafe.user.first_name || "Атлет";
        localStorage.setItem('tgId', tgId);
        localStorage.setItem('userName', tgName); 

        const { data } = await supabaseClient.from('user_links').select('*').eq('telegram_id', tgId).maybeSingle(); 

        if (data && data.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
            localStorage.setItem('cachedXP', data.xp || 0);
            localStorage.setItem('cachedBurned', data.burned || 0);
            if (data.email) localStorage.setItem('linkedEmail', data.email);
            if (data.name) localStorage.setItem('userName', data.name);
        } else {
            let linkedEmail = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
            let existingData = null;
            if (linkedEmail) {
                const { data: emailData } = await supabaseClient.from('user_links').select('*').eq('email', linkedEmail).maybeSingle();
                if (emailData) existingData = emailData;
            }

            const defaultProfile = existingData ? existingData.profile : { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            const xp = existingData ? existingData.xp : 0;
            const burned = existingData ? existingData.burned : 0;
            
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            localStorage.setItem('cachedXP', xp || 0);
            localStorage.setItem('cachedBurned', burned || 0);
            
            await saveProgressToCloud();
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
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
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password }); 

        if (error) {
            if (error.message.includes("Invalid login credentials")) {
                tg.showAlert("Неверный Email или пароль.");
            } else {
                tg.showAlert("Ошибка входа: " + error.message);
            }
        } else {
            tg.showAlert("Успешный вход!");
            localStorage.setItem('loginType', 'email');
            localStorage.setItem('currentEmail', email);
            const emailName = email.split('@')[0];
            localStorage.setItem('userName', emailName); 

            const { data: linkData } = await supabaseClient.from('user_links').select('*').eq('email', email).maybeSingle(); 

            if (linkData && linkData.profile) {
                localStorage.setItem('cachedProfile', JSON.stringify(linkData.profile));
                localStorage.setItem('cachedXP', linkData.xp || 0);
                localStorage.setItem('cachedBurned', linkData.burned || 0);
                if (linkData.telegram_id) localStorage.setItem('tgId', linkData.telegram_id);
                if (linkData.name) localStorage.setItem('userName', linkData.name);
            } else {
                const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
                localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
                localStorage.setItem('cachedXP', 0);
                localStorage.setItem('cachedBurned', 0);
                await saveProgressToCloud();
            }
            renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        }
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    } finally {
        btn.innerText = "Продолжить";
        btn.disabled = false;
    }
} 

// --- ОТРИСОВКА ПРОФИЛЯ ---
const levelsData = {
    male: [{ xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" }, { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" }],
    female: [{ xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" }, { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" }]
}; 

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male'; 

function renderProfile(profile) {
    userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme'; 

    let bmr = userGender === 'male' ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5) : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    let cals = profile.goal === 'lose' ? (bmr * 1.375 - 500) : (bmr * 1.375 + 500);
    if (document.getElementById('calories-norm')) document.getElementById('calories-norm').innerText = Math.round(cals) + " ккал"; 

    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0); 

    const pendingXP = parseInt(localStorage.getItem('pendingXP') || 0);
    if (pendingXP > 0) {
        currentXP += pendingXP;
        localStorage.setItem('cachedXP', currentXP);
        localStorage.removeItem('pendingXP');
        saveProgressToCloud();
    } 

    if (document.getElementById('burned-total')) document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    updateCharacterUI();
    openScreen('dashboard-screen');
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

    let nextLevelXp = 100;
    if (newLevelIndex + 1 < levels.length) {
        nextLevelXp = levels[newLevelIndex + 1].xp;
    }
    let percent = (currentXP / nextLevelXp) * 100;
    if (percent > 100) percent = 100;
    if (document.getElementById('xp-bar')) document.getElementById('xp-bar').style.width = percent + "%";
} 

// --- НАСТРОЙКИ С РЕДАКТИРОВАНИЕМ ---
function openProfileSettings() {
    const loginType = localStorage.getItem('loginType') || 'telegram'; 

    if (loginType === 'telegram') {
        document.getElementById('link-title').innerText = "Привязка Email";
        document.getElementById('link-desc').innerText = "Привяжите Email, чтобы заходить с любого устройства.";
        const linked = localStorage.getItem('linkedEmail');
        if (linked) {
            document.getElementById('link-email-form').innerHTML = `
                <p style="color: #34c759; font-size: 16px; font-weight: bold; margin-top: 10px;">✅ Email привязан: ${linked}</p>
                <button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px;" onclick="unlinkEmail()">Отвязать Email</button>
            `;
        } else {
            document.getElementById('link-email-form').innerHTML = `
                <div class="form-group"><input type="email" id="link-email" placeholder="your@email.com"></div>
                <div class="form-group"><input type="password" id="link-password" placeholder="Пароль (мин. 6 символов)"></div>
                <button class="btn" onclick="linkEmailToTelegram()">Привязать Email</button>
            `;
        }
        document.getElementById('link-email-form').style.display = 'block';
        document.getElementById('link-tg-form').style.display = 'none';
    } else {
        document.getElementById('link-title').innerText = "Привязка Telegram";
        document.getElementById('link-desc').innerText = "Ваш Telegram ID для входа с телефона.";
        const tgId = localStorage.getItem('tgId');
        if (tgId) {
            document.getElementById('link-tg-form').innerHTML = `
                <p style="color: #34c759; font-size: 16px; font-weight: bold; margin-top: 10px;">✅ Telegram привязан: ${tgId}</p>
                <button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px;" onclick="unlinkTelegram()">Отвязать Telegram</button>
            `;
        } else {
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                document.getElementById('link-tg-form').innerHTML = `
                    <p style="font-size: 14px; color: #fff; margin-bottom: 10px;">Ваш Telegram ID: <b>${tg.initDataUnsafe.user.id}</b></p>
                    <button class="btn" onclick="linkTelegramToEmail()">Привязать Telegram</button>
                `;
            }
        }
        document.getElementById('link-email-form').style.display = 'none';
        document.getElementById('link-tg-form').style.display = 'block';
    } 

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
        const { data: check } = await supabaseClient.from('user_links').select('telegram_id').eq('email', email).maybeSingle();
        if (check && check.telegram_id && check.telegram_id !== tg.initDataUnsafe.user.id) {
            tg.showAlert("Эта почта уже привязана к другому Telegram!");
            return;
        }

        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error && error.message !== "User already registered") {
            tg.showAlert("Ошибка: " + error.message);
        } else {
            localStorage.setItem('linkedEmail', email);
            localStorage.setItem('currentEmail', email);
            await saveProgressToCloud();
            tg.showAlert("Email успешно привязан! Теперь прогресс синхронизирован.");
            openProfileSettings();
        }
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    }
} 

async function linkTelegramToEmail() {
    const tgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : null;
    const email = localStorage.getItem('currentEmail');
    if (!tgId || !email) { tg.showAlert("Ошибка: нет данных Telegram или Email."); return; }

    try {
        const { data: check } = await supabaseClient.from('user_links').select('email').eq('telegram_id', tgId).maybeSingle();
        if (check && check.email && check.email !== email) {
            tg.showAlert("Этот Telegram уже привязан к другой почте!");
            return;
        }
        
        localStorage.setItem('tgId', tgId);
        await saveProgressToCloud();
        tg.showAlert("Telegram успешно привязан! Теперь прогресс синхронизирован.");
        openProfileSettings();
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    }
} 

async function unlinkEmail() {
    if (!confirm("Отвязать Email? Прогресс останется в Telegram.")) return;
    localStorage.removeItem('linkedEmail');
    localStorage.removeItem('currentEmail');
    await saveProgressToCloud();
    tg.showAlert("Email отвязан.");
    openProfileSettings();
}

async function unlinkTelegram() {
    if (!confirm("Отвязать Telegram? Прогресс останется в Email.")) return;
    localStorage.removeItem('tgId');
    await saveProgressToCloud();
    tg.showAlert("Telegram отвязан.");
    openProfileSettings();
} 

async function saveProfile() {
    const age = document.getElementById('age').value;
    const gender = document.getElementById('gender').value;
    const weight = document.getElementById('weight').value;
    const height = document.getElementById('height').value;
    const goal = document.getElementById('goal').value; 

    if (!age || !weight || !height) { tg.showAlert("Заполни все поля!"); return; } 

    const profile = { age: age, gender: gender, weight: weight, height: height, goal: goal };
    localStorage.setItem('cachedProfile', JSON.stringify(profile)); 
    await saveProgressToCloud(); 
    renderProfile(profile);
    tg.showAlert("Данные сохранены!");
} 

async function logout() {
    await saveProgressToCloud();
    if (confirm("Выйти из аккаунта? Прогресс сохранен.")) {
        localStorage.clear();
        await supabaseClient.auth.signOut();
        location.reload();
    }
}
