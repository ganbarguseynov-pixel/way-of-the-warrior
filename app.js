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

async function resolveUserRecord(tgId, email) {
    if (!tgId && !email) return null; 

    let recordsMap = new Map(); 

    if (tgId) {
        const { data } = await supabaseClient.from('user_links').select('*').eq('telegram_id', tgId);
        if (data) data.forEach(r => recordsMap.set(r.id, r));
    }
    if (email) {
        const { data } = await supabaseClient.from('user_links').select('*').eq('email', email);
        if (data) data.forEach(r => recordsMap.set(r.id, r));
    } 

    let records = Array.from(recordsMap.values()); 

    let linkedTgId = tgId;
    let linkedEmail = email;
    records.forEach(r => {
        if (r.telegram_id) linkedTgId = r.telegram_id;
        if (r.email) linkedEmail = r.email;
    }); 

    if (linkedTgId && linkedTgId !== tgId) {
        const { data } = await supabaseClient.from('user_links').select('*').eq('telegram_id', linkedTgId);
        if (data) data.forEach(r => recordsMap.set(r.id, r));
    }
    if (linkedEmail && linkedEmail !== email) {
        const { data } = await supabaseClient.from('user_links').select('*').eq('email', linkedEmail);
        if (data) data.forEach(r => recordsMap.set(r.id, r));
    } 

    records = Array.from(recordsMap.values());
    if (records.length === 0) return null; 

    if (records.length === 1) {
        const r = records[0];
        let needsUpdate = false;
        let updateObj = {};
        if (tgId && !r.telegram_id) { updateObj.telegram_id = tgId; needsUpdate = true; }
        if (email && !r.email) { updateObj.email = email; needsUpdate = true; }
        if (needsUpdate) {
            await supabaseClient.from('user_links').update(updateObj).eq('id', r.id);
            Object.assign(r, updateObj);
        }
        return r;
    } 

    let mergedFood = [];
    let maxXp = 0;
    let maxBurned = 0;
    let profile = null;
    let name = null; 

    records.forEach(rec => {
        if (rec.food && Array.isArray(rec.food)) {
            mergedFood = mergedFood.concat(rec.food);
        }
        if (rec.xp && rec.xp > maxXp) maxXp = rec.xp;
        if (rec.burned && rec.burned > maxBurned) maxBurned = rec.burned;
        if (rec.profile && !profile) profile = rec.profile;
        if (rec.name && !name) name = rec.name;
    }); 

    const uniqueFood = [];
    const seen = new Set();
    mergedFood.forEach(f => {
        const key = JSON.stringify(f);
        if (!seen.has(key)) {
            seen.add(key);
            uniqueFood.push(f);
        }
    }); 

    const mainRecord = records[0];
    const idsToDelete = records.slice(1).map(r => r.id); 

    const updateData = {
        telegram_id: linkedTgId || mainRecord.telegram_id || null,
        email: linkedEmail || mainRecord.email || null,
        food: uniqueFood,
        xp: maxXp,
        burned: maxBurned,
        profile: profile || mainRecord.profile,
        name: name || mainRecord.name || "Атлет"
    }; 

    await supabaseClient.from('user_links').update(updateData).eq('id', mainRecord.id);
    if (idsToDelete.length > 0) {
        await supabaseClient.from('user_links').delete().in('id', idsToDelete);
    } 

    return { ...mainRecord, ...updateData };
} 

window.addEventListener('load', async () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    }
    await syncFoodFromCloud();
}); 

async function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        localStorage.setItem('loginType', 'telegram');
        const tgId = tg.initDataUnsafe.user.id;
        const tgName = tg.initDataUnsafe.user.first_name || "Атлет";
        localStorage.setItem('tgId', tgId);
        localStorage.setItem('userName', tgName); 

        const data = await resolveUserRecord(tgId, null); 

        if (data && data.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
            localStorage.setItem('cachedXP', data.xp || 0);
            localStorage.setItem('cachedBurned', data.burned || 0);
            if (data.email) {
                localStorage.setItem('linkedEmail', data.email);
                localStorage.setItem('currentEmail', data.email);
            } else {
                localStorage.removeItem('linkedEmail');
                localStorage.removeItem('currentEmail');
            }
            if (data.name) localStorage.setItem('userName', data.name);
            if (data.food) localStorage.setItem('todayFood', JSON.stringify(data.food));
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            localStorage.setItem('cachedXP', 0);
            localStorage.setItem('cachedBurned', 0);
            await saveProgressToCloud(tgId, null, tgName, defaultProfile, 0, 0);
            openOnboardingModal();
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        await syncFoodFromCloud();
    } else {
        tg.showAlert("Откройте через Telegram!");
    }
} 

function showEmailForm() { openScreen('email-screen'); } 

async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('email-submit-btn'); 

    if (!email || !password) { tg.showAlert("Заполните все поля!"); return; }
    btn.innerText = "Загрузка...";
    btn.disabled = true; 

    try {
        let { error } = await supabaseClient.auth.signInWithPassword({ email, password }); 

        if (error) {
            if (error.message.includes("Invalid login credentials")) {
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
                if (signUpError) {
                    tg.showAlert("Ошибка регистрации: " + signUpError.message);
                    btn.innerText = "Продолжить"; btn.disabled = false; return;
                }
                if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                    tg.showAlert("Неверный пароль. Этот аккаунт уже существует.");
                    btn.innerText = "Продолжить"; btn.disabled = false; return;
                }
                if (!signUpData.session) {
                    await supabaseClient.auth.signInWithPassword({ email, password });
                }
                tg.showAlert("Аккаунт успешно создан!");
            } else {
                tg.showAlert("Ошибка входа: " + error.message);
                btn.innerText = "Продолжить"; btn.disabled = false; return;
            }
        } else {
            tg.showAlert("Успешный вход!");
        } 

        localStorage.setItem('loginType', 'email');
        localStorage.setItem('currentEmail', email);
        const emailName = email.split('@')[0];
        localStorage.setItem('userName', emailName); 

        const linkData = await resolveUserRecord(null, email); 

        if (linkData && linkData.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(linkData.profile));
            localStorage.setItem('cachedXP', linkData.xp || 0);
            localStorage.setItem('cachedBurned', linkData.burned || 0);
            if (linkData.telegram_id) {
                localStorage.setItem('tgId', linkData.telegram_id);
                localStorage.setItem('linkedEmail', email);
            } else {
                localStorage.removeItem('tgId');
            }
            if (linkData.name) localStorage.setItem('userName', linkData.name);
            if (linkData.food) localStorage.setItem('todayFood', JSON.stringify(linkData.food));
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            localStorage.setItem('cachedXP', 0);
            localStorage.setItem('cachedBurned', 0);
            await saveProgressToCloud(null, email, emailName, defaultProfile, 0, 0);
            openOnboardingModal();
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        await syncFoodFromCloud();
        
    } catch (e) {
        tg.showAlert("Ошибка сети.");
    } finally {
        btn.innerText = "Продолжить";
        btn.disabled = false;
    }
} 

function openOnboardingModal() {
    setTimeout(() => {
        document.getElementById('onboarding-modal').classList.add('active');
    }, 500);
}

async function saveOnboardingData() {
    const age = document.getElementById('onboarding-age').value;
    const weight = document.getElementById('onboarding-weight').value;
    const height = document.getElementById('onboarding-height').value;
    const gender = document.getElementById('onboarding-gender').value;
    const goal = document.getElementById('onboarding-goal').value;

    if (!age || !weight || !height) { 
        tg.showAlert("Пожалуйста, заполни возраст, вес и рост!"); 
        return; 
    }

    const profile = { age, gender, weight, height, goal, custom_calories: '', custom_protein: '', custom_fat: '', custom_carbs: '' };
    localStorage.setItem('cachedProfile', JSON.stringify(profile));

    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
    const name = localStorage.getItem('userName') || "Атлет";
    
    await saveProgressToCloud(tgId, email, name, profile, 0, 0);
    
    document.getElementById('onboarding-modal').classList.remove('active');
    renderProfile(profile);
    tg.showAlert("Отлично! Данные сохранены.");
}

async function syncFoodFromCloud() {
    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    if (!tgId && !email) return; 

    const record = await resolveUserRecord(tgId, email);
    let localFood = [];
    try { localFood = JSON.parse(localStorage.getItem('todayFood') || '[]'); } catch(e) {} 

    if (record) {
        const cloudFood = record.food || [];
        if (cloudFood.length > 0) {
            localStorage.setItem('todayFood', JSON.stringify(cloudFood));
        } else if (localFood.length > 0) {
            await supabaseClient.from('user_links').update({ food: localFood }).eq('id', record.id);
        }
        updateDashboard();
    }
} 

async function saveFoodToCloud(foodArray) {
    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    if (!tgId && !email) return; 

    const record = await resolveUserRecord(tgId, email);
    if (record) {
        await supabaseClient.from('user_links').update({ food: foodArray }).eq('id', record.id);
    }
}
 
async function saveProgressToCloud(tgId, email, name, profile, xp, burned) {
    try {
        let currentTgId = tgId || localStorage.getItem('tgId');
        let currentEmail = email || localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
        let currentName = name || localStorage.getItem('userName') || "Атлет"; 

        if (!currentTgId && !currentEmail) return; 

        const existing = await resolveUserRecord(currentTgId, currentEmail); 

        if (existing) {
            await supabaseClient.from('user_links').update({
                profile: profile, xp: xp, burned: burned, name: currentName,
                telegram_id: currentTgId || null, email: currentEmail || null
            }).eq('id', existing.id);
        } else {
            await supabaseClient.from('user_links').insert([{
                telegram_id: currentTgId, email: currentEmail, profile: profile, xp: xp, burned: burned, name: currentName
            }]);
        }
    } catch (e) {
        console.log("Ошибка сохранения:", e);
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
    saveProgressToCloud(localStorage.getItem('tgId'), localStorage.getItem('currentEmail'), localStorage.getItem('userName'), currentProfileData, currentXP, totalBurnedCalories);
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
    const loginType = localStorage.getItem('loginType') || 'telegram';
    if (loginType === 'telegram') {
        document.getElementById('link-title').innerText = "Привязка Email";
        document.getElementById('link-desc').innerText = "Привяжите Email, чтобы заходить с любого устройства.";
        const linked = localStorage.getItem('linkedEmail');
        if (linked) {
            document.getElementById('link-email-form').innerHTML = `<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Email привязан: ${linked}</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkEmail()">Отвязать Email</button>`;
        } else {
            document.getElementById('link-email-form').innerHTML = `
                <div class="form-group" style="margin-bottom: 10px;"><input type="email" id="link-email" placeholder="your@email.com" style="padding: 10px;"></div>
                <div class="form-group" style="margin-bottom: 10px;"><input type="password" id="link-password" placeholder="Пароль (мин. 6 символов)" style="padding: 10px;"></div>
                <button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkEmailToTelegram()">Привязать Email</button>`;
        }
        document.getElementById('link-email-form').style.display = 'block';
        document.getElementById('link-tg-form').style.display = 'none';
    } else {
        document.getElementById('link-title').innerText = "Привязка Telegram";
        document.getElementById('link-desc').innerText = "Ваш Telegram ID для входа с телефона.";
        const tgId = localStorage.getItem('tgId');
        if (tgId) {
            document.getElementById('link-tg-form').innerHTML = `<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Telegram привязан: ${tgId}</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkTelegram()">Отвязать Telegram</button>`;
        } else {
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                document.getElementById('link-tg-form').innerHTML = `<p style="font-size: 14px; color: #fff; margin-bottom: 10px;">Ваш Telegram ID: <b>${tg.initDataUnsafe.user.id}</b></p><button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkTelegramToEmail()">Привязать Telegram</button>`;
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
        document.getElementById('custom-calories').value = p.custom_calories || '';
        document.getElementById('custom-protein').value = p.custom_protein || '';
        document.getElementById('custom-fat').value = p.custom_fat || '';
        document.getElementById('custom-carbs').value = p.custom_carbs || '';
    }
    openScreen('profile-settings-screen');
} 

async function linkEmailToTelegram() {
    const email = document.getElementById('link-email').value;
    const password = document.getElementById('link-password').value;
    if (!email || !password) { tg.showAlert("Заполните Email и пароль!"); return; } 

    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error && error.message !== "User already registered") {
            tg.showAlert("Ошибка: " + error.message);
        } else {
            const tgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : localStorage.getItem('tgId');
            const profile = JSON.parse(localStorage.getItem('cachedProfile'));
            const xp = parseInt(localStorage.getItem('cachedXP') || 0);
            const burned = parseInt(localStorage.getItem('cachedBurned') || 0);
            const name = localStorage.getItem('userName') || "Атлет";
            await saveProgressToCloud(tgId, email, name, profile, xp, burned);
            localStorage.setItem('linkedEmail', email);
            localStorage.setItem('currentEmail', email);
            tg.showAlert("Email успешно привязан!");
            openProfileSettings();
        }
    } catch (e) { tg.showAlert("Ошибка сети."); }
} 

async function linkTelegramToEmail() {
    const tgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : null;
    const tgName = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.first_name : "Атлет";
    const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
    const profile = JSON.parse(localStorage.getItem('cachedProfile'));
    const xp = parseInt(localStorage.getItem('cachedXP') || 0);
    const burned = parseInt(localStorage.getItem('cachedBurned') || 0);
    if (!tgId || !email) { tg.showAlert("Ошибка: не найден Email или Telegram ID."); return; } 

    await saveProgressToCloud(tgId, email, tgName, profile, xp, burned);
    localStorage.setItem('tgId', tgId);
    localStorage.setItem('userName', tgName);
    tg.showAlert("Telegram успешно привязан!");
    openProfileSettings();
} 

async function unlinkEmail() {
    if (!confirm("Отвязать Email? Прогресс останется в Telegram.")) return;
    const tgId = localStorage.getItem('tgId');
    if (tgId) {
        const record = await resolveUserRecord(tgId, null);
        if (record) await supabaseClient.from('user_links').update({ email: null }).eq('id', record.id);
    }
    localStorage.removeItem('linkedEmail');
    localStorage.removeItem('currentEmail');
    tg.showAlert("Email отвязан.");
    openProfileSettings();
} 

async function unlinkTelegram() {
    if (!confirm("Отвязать Telegram? Прогресс останется в Email.")) return;
    const email = localStorage.getItem('currentEmail');
    if (email) {
        const record = await resolveUserRecord(null, email);
        if (record) await supabaseClient.from('user_links').update({ telegram_id: null }).eq('id', record.id);
    }
    localStorage.removeItem('tgId');
    tg.showAlert("Telegram отвязан.");
    openProfileSettings();
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
    await saveProgressToCloud(localStorage.getItem('tgId'), localStorage.getItem('currentEmail'), localStorage.getItem('userName'), profile, currentXP, totalBurnedCalories);
    renderProfile(profile);
    tg.showAlert("Данные сохранены!");
} 

async function logout() {
    if (confirm("Выйти из аккаунта? Прогресс сохранен.")) {
        localStorage.clear();
        await supabaseClient.auth.signOut();
        location.reload();
    }
} 

let isShakeTesting = false; let maxShakeValue = 0;
async function startShakeTest() {
    if (isShakeTesting) return;
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { const permission = await DeviceMotionEvent.requestPermission(); if (permission !== 'granted') { tg.showAlert("Нет доступа."); return; } } catch (e) { return; }
    }
    isShakeTesting = true; maxShakeValue = 0;
    document.getElementById('test-shake-btn').style.display = 'none';
    document.getElementById('stop-shake-btn').style.display = 'block';
    window.addEventListener('devicemotion', function(event) {
        if (!isShakeTesting) return;
        const acc = event.accelerationIncludingGravity;
        if (acc) { const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0); if (Math.round(force) > maxShakeValue) maxShakeValue = Math.round(force); }
    });
    tg.showAlert("Тряси телефон!");
}
function stopShakeTest() { 
    isShakeTesting = false; 
    document.getElementById('test-shake-btn').style.display = 'block'; 
    document.getElementById('stop-shake-btn').style.display = 'none'; 
    tg.showAlert("Максимум: " + maxShakeValue); 
}
