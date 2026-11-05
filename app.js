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
            
            const today = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
            if (data.profile.water && data.profile.waterDate === today) {
                localStorage.setItem('todayWater', JSON.stringify(data.profile.water));
                localStorage.setItem('waterListDate', today);
            } else {
                localStorage.setItem('todayWater', '[]');
                localStorage.setItem('waterListDate', today);
            }

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
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose', custom_water_goal: 2000 };
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

            const today = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
            if (linkData.profile.water && linkData.profile.waterDate === today) {
                localStorage.setItem('todayWater', JSON.stringify(linkData.profile.water));
                localStorage.setItem('waterListDate', today);
            } else {
                localStorage.setItem('todayWater', '[]');
                localStorage.setItem('waterListDate', today);
            }

            if (linkData.telegram_id) {
                localStorage.setItem('tgId', linkData.telegram_id);
                localStorage.setItem('linkedEmail', email);
            } else {
                localStorage.removeItem('tgId');
            }
            if (linkData.name) localStorage.setItem('userName', linkData.name);
            if (linkData.food) localStorage.setItem('todayFood', JSON.stringify(linkData.food));
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose', custom_water_goal: 2000 };
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

    // АВТОМАТИЧЕСКИЙ РАСЧЕТ НОРМЫ ВОДЫ (30 мл на 1 кг веса)
    const calculatedWater = weight ? Math.round(parseFloat(weight) * 30) : 2000;

    const profile = { age, gender, weight, height, goal, custom_calories: '', custom_protein: '', custom_fat: '', custom_carbs: '', custom_water_goal: calculatedWater };
    localStorage.setItem('cachedProfile', JSON.stringify(profile)); 

    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
    const name = localStorage.getItem('userName') || "Атлет"; 

    await saveProgressToCloud(tgId, email, name, profile, 0, 0); 

    document.getElementById('onboarding-modal').classList.remove('active');
    renderProfile(profile);
    tg.showAlert("Отлично! Твоя норма воды рассчитана автоматически.");
} 

async function syncFoodFromCloud() {
    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    if (!tgId && !email) return; 

    const record = await resolveUserRecord(tgId, email);
    let localFood = [];
    try { localFood = JSON.parse(localStorage.getItem('todayFood') || '[]'); } catch(e) {} 

    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const savedDate = localStorage.getItem('foodListDate'); 

    if (record) {
        const cloudFood = record.food || []; 

        if (!savedDate) {
            if (cloudFood.length > 0) {
                localStorage.setItem('todayFood', JSON.stringify(cloudFood));
            } else if (localFood.length > 0) {
                await supabaseClient.from('user_links').update({ food: localFood }).eq('id', record.id);
            }
            localStorage.setItem('foodListDate', today);
        } else if (savedDate === today) {
            if (cloudFood.length > 0) {
                localStorage.setItem('todayFood', JSON.stringify(cloudFood));
            } else if (localFood.length > 0) {
                await supabaseClient.from('user_links').update({ food: localFood }).eq('id', record.id);
            }
        } else {
            archiveFoodToHistory(localFood, savedDate);
            localStorage.setItem('todayFood', '[]');
            localStorage.setItem('foodListDate', today);
            await supabaseClient.from('user_links').update({ food: [] }).eq('id', record.id);
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

async function syncWaterToProfile() {
    let todayWater = [];
    try { todayWater = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    
    const today = localStorage.getItem('waterListDate');
    let prof = JSON.parse(localStorage.getItem('cachedProfile') || '{}');
    
    prof.water = todayWater;
    prof.waterDate = today;
    localStorage.setItem('cachedProfile', JSON.stringify(prof));
    
    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    const name = localStorage.getItem('userName') || "Атлет"; 
    
    await saveProgressToCloud(tgId, email, name, prof, currentXP, totalBurnedCalories);
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
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    if (localStorage.getItem('foodListDate') !== today) {
        localStorage.setItem('todayFood', '[]');
        localStorage.setItem('foodListDate', today);
    }
    
    if (localStorage.getItem('waterListDate') !== today) {
        localStorage.setItem('todayWater', '[]');
        localStorage.setItem('waterListDate', today);
    }
} 

// --- ВОДА ---
function updateCustomWaterBtn() {
    const btn = document.getElementById('custom-water-quick-btn');
    if (!btn) return;
    const saved = localStorage.getItem('customWaterAmount');
    if (saved && parseInt(saved) > 0) {
        btn.innerText = `+${saved}`;
    } else {
        btn.innerText = "+Своя";
    }
}

function quickAddCustomWater() {
    const customAmount = localStorage.getItem('customWaterAmount');
    if (customAmount && parseInt(customAmount) > 0) {
        addWater(customAmount);
    } else {
        openCustomWaterModal();
    }
}

function addWater(amount) {
    let waterArr = [];
    try { waterArr = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    waterArr.push({ amount: parseInt(amount), time: new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) });
    localStorage.setItem('todayWater', JSON.stringify(waterArr));
    
    syncWaterToProfile(); 
    updateDashboard();
    
    const today = localStorage.getItem('waterListDate');
    archiveWaterToHistory(waterArr, today);
}

function deleteWaterItem(index) {
    let waterArr = [];
    try { waterArr = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    waterArr.splice(index, 1);
    localStorage.setItem('todayWater', JSON.stringify(waterArr));
    
    syncWaterToProfile(); 
    updateDashboard();
    
    const today = localStorage.getItem('waterListDate');
    archiveWaterToHistory(waterArr, today);
}

function openCustomWaterModal() {
    const saved = localStorage.getItem('customWaterAmount');
    document.getElementById('custom-water-input').value = saved ? saved : '';
    document.getElementById('water-modal').classList.add('active');
}
function closeCustomWaterModal() {
    document.getElementById('water-modal').classList.remove('active');
}
function addCustomWater() {
    const val = parseInt(document.getElementById('custom-water-input').value);
    if (val && val > 0) {
        localStorage.setItem('customWaterAmount', val);
        updateCustomWaterBtn();
        addWater(val);
        closeCustomWaterModal();
    } else {
        tg.showAlert("Введите корректный объем!");
    }
}

// --- ИСТОРИЯ ---
function archiveFoodToHistory(foodArray, dateString) {
    if (!foodArray || foodArray.length === 0 || !dateString) return;
    let history = {};
    try { history = JSON.parse(localStorage.getItem('foodHistory') || '{}'); } catch(e) {}
    history[dateString] = foodArray;
    localStorage.setItem('foodHistory', JSON.stringify(history));
}

function archiveWaterToHistory(waterArray, dateString) {
    if (!waterArray || waterArray.length === 0 || !dateString) return;
    let history = {};
    try { history = JSON.parse(localStorage.getItem('waterHistory') || '{}'); } catch(e) {}
    history[dateString] = waterArray;
    localStorage.setItem('waterHistory', JSON.stringify(history));
}

function openHistoryScreen() {
    const startInput = document.getElementById('history-start-date');
    const endInput = document.getElementById('history-end-date');
    
    if (startInput && !startInput.value) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        startInput.value = firstDay.toISOString().split('T')[0];
        endInput.value = now.toISOString().split('T')[0];
    }
    openScreen('history-screen');
    renderHistory();
}

function setHistoryPeriod(type) {
    const startInput = document.getElementById('history-start-date');
    const endInput = document.getElementById('history-end-date');
    const now = new Date();
    
    endInput.value = now.toISOString().split('T')[0];

    if (type === '7days') {
        const past = new Date(now);
        past.setDate(now.getDate() - 7);
        startInput.value = past.toISOString().split('T')[0];
    } else if (type === '30days') {
        const past = new Date(now);
        past.setDate(now.getDate() - 30);
        startInput.value = past.toISOString().split('T')[0];
    } else if (type === 'month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        startInput.value = firstDay.toISOString().split('T')[0];
    } else if (type === 'all') {
        startInput.value = '2020-01-01';
    }
    renderHistory();
}

function renderHistory() {
    const listDiv = document.getElementById('history-list');
    const summaryDiv = document.getElementById('history-period-summary');
    const startInput = document.getElementById('history-start-date');
    const endInput = document.getElementById('history-end-date');
    
    if (!listDiv || !summaryDiv || !startInput || !endInput) return;

    const startDate = startInput.value;
    const endDate = endInput.value;
    if (!startDate || !endDate) return;

    let foodHistory = {};
    let waterHistory = {};
    try { foodHistory = JSON.parse(localStorage.getItem('foodHistory') || '{}'); } catch(e) {}
    try { waterHistory = JSON.parse(localStorage.getItem('waterHistory') || '{}'); } catch(e) {}

    const allDates = new Set([...Object.keys(foodHistory), ...Object.keys(waterHistory)]);
    const datesInRange = Array.from(allDates).filter(date => date >= startDate && date <= endDate).sort((a, b) => new Date(b) - new Date(a));

    if (datesInRange.length === 0) {
        summaryDiv.style.display = 'none';
        listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; margin-top: 20px;">За выбранный период записей нет.</p>';
        return;
    }

    let periodCal = 0, periodProt = 0, periodFat = 0, periodCarb = 0, periodWater = 0;
    let html = '';

    datesInRange.forEach(date => {
        const foods = foodHistory[date] || [];
        const waters = waterHistory[date] || [];
        
        if (foods.length === 0 && waters.length === 0) return;

        let dayCal = 0, dayProt = 0, dayFat = 0, dayCarb = 0, dayWater = 0;
        
        foods.forEach(f => {
            dayCal += parseFloat(f.calories_100g || 0);
            dayProt += parseFloat(f.proteins_100g || 0);
            dayFat += parseFloat(f.fat_100g || 0);
            dayCarb += parseFloat(f.carbs_100g || 0);
        });
        
        waters.forEach(w => {
            dayWater += parseInt(w.amount || 0);
        });

        periodCal += dayCal;
        periodProt += dayProt;
        periodFat += dayFat;
        periodCarb += dayCarb;
        periodWater += dayWater;

        const dayDisplay = date.split('-').reverse().join('.');

        html += `<div class="history-card">`;
        html += `<div class="history-date">📅 ${dayDisplay}</div>`;
        
        html += `<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 5px; text-align: center; margin-bottom: 10px;">`;
        html += `<div><span style="color: var(--accent-color); font-weight: bold; font-size: 14px;">${Math.round(dayCal)}</span><br><span style="font-size: 10px; color: #8e8e93;">Ккал</span></div>`;
        html += `<div><span style="color: #fff; font-weight: bold; font-size: 14px;">${Math.round(dayProt)}</span><br><span style="font-size: 10px; color: #8e8e93;">Бел.</span></div>`;
        html += `<div><span style="color: #fff; font-weight: bold; font-size: 14px;">${Math.round(dayFat)}</span><br><span style="font-size: 10px; color: #8e8e93;">Жир.</span></div>`;
        html += `<div><span style="color: #fff; font-weight: bold; font-size: 14px;">${Math.round(dayCarb)}</span><br><span style="font-size: 10px; color: #8e8e93;">Угл.</span></div>`;
        html += `</div>`;
        
        if (dayWater > 0) {
            html += `<div style="text-align: center; margin-bottom: 10px; color: #5ac8fa; font-size: 13px; font-weight: bold;">💧 Выпито воды: ${dayWater} мл</div>`;
        }

        html += `<div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">`;
        foods.forEach(f => {
            html += `<div class="history-food-item" style="display: flex; justify-content: space-between; margin-bottom: 5px;">`;
            html += `<span>${f.product_name}</span><span style="color: #8e8e93;">${Math.round(f.calories_100g || 0)} ккал</span></div>`;
        });
        
        waters.forEach(w => {
            html += `<div class="history-water-item" style="display: flex; justify-content: space-between; margin-bottom: 5px;">`;
            html += `<span>💧 Вода</span><span style="color: #8e8e93;">${w.amount} мл</span></div>`;
        });
        
        html += `</div></div>`;
    });

    summaryDiv.style.display = 'block';
    document.getElementById('hist-total-cal').innerText = Math.round(periodCal);
    document.getElementById('hist-total-prot').innerText = Math.round(periodProt);
    document.getElementById('hist-total-fat').innerText = Math.round(periodFat);
    document.getElementById('hist-total-carb').innerText = Math.round(periodCarb);
    document.getElementById('hist-total-water').innerText = periodWater;

    listDiv.innerHTML = html;
}

function updateDashboard() {
    if (!currentProfileData) return;
    checkDayReset();
    
    updateCustomWaterBtn();

    const norm = calculateNutrition(currentProfileData);
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    
    const savedDate = localStorage.getItem('foodListDate');
    if (savedDate && todayFood.length > 0) {
        archiveFoodToHistory(todayFood, savedDate);
    }

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
    
    if (document.getElementById('calories-norm')) {
        document.getElementById('calories-norm').innerText = norm.calories + " ккал";
    }

    renderTodayFoodList(todayFood);

    let todayWater = [];
    try { todayWater = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    
    const waterDate = localStorage.getItem('waterListDate');
    if (waterDate && todayWater.length > 0) {
        archiveWaterToHistory(todayWater, waterDate);
    }

    let eatenWater = 0;
    todayWater.forEach(w => eatenWater += parseInt(w.amount || 0));
    
    const waterGoal = currentProfileData.custom_water_goal || 2000;

    if (document.getElementById('eaten-water')) document.getElementById('eaten-water').innerText = eatenWater;
    if (document.getElementById('norm-water')) document.getElementById('norm-water').innerText = waterGoal;
    
    renderTodayWaterList(todayWater);
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

function renderTodayWaterList(todayWater) {
    const listDiv = document.getElementById('today-water-list');
    if (!listDiv) return;
    if (todayWater.length === 0) { listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не выпито</p>'; return; }
    let html = '';
    todayWater.forEach((w, index) => {
        html += `<div class="compact-food-item" style="border-left: 2px solid #5ac8fa;"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">💧 ${w.amount} мл (${w.time})</div><button onclick="deleteWaterItem(${index})" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>`;
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
    try {
        const loginType = localStorage.getItem('loginType') || 'telegram';
        if (loginType === 'telegram') {
            document.getElementById('link-title').innerText = "Привязка Email";
            document.getElementById('link-desc').innerText = "Привяжите Email, чтобы заходить с любого устройства.";
            const linked = localStorage.getItem('linkedEmail');
            if (linked) {
                document.getElementById('link-email-form').innerHTML = `
                    <p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Email привязан: ${linked}</p>
                    <button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkEmail()">Отвязать Email</button>
                `;
            } else {
                document.getElementById('link-email-form').innerHTML = `
                    <div class="form-group" style="margin-bottom: 10px;"><input type="email" id="link-email" placeholder="your@email.com" style="padding: 10px;"></div>
                    <div class="form-group" style="margin-bottom: 10px;"><input type="password" id="link-password" placeholder="Пароль (мин. 6 символов)" style="padding: 10px;"></div>
                    <button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkEmailToTelegram()">Привязать Email</button>
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
                    <p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Telegram привязан: ${tgId}</p>
                    <button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkTelegram()">Отвязать Telegram</button>
                `;
            } else {
                if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                    document.getElementById('link-tg-form').innerHTML = `
                        <p style="font-size: 14px; color: #fff; margin-bottom: 10px;">Ваш Telegram ID: <b>${tg.initDataUnsafe.user.id}</b></p>
                        <button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkTelegramToEmail()">Привязать Telegram</button>
                    `;
                }
            }
            document.getElementById('link-email-form').style.display = 'none';
            document.getElementById('link-tg-form').style.display = 'block';
        }
        const cachedProfile = localStorage.getItem('cachedProfile');
        if (cachedProfile) {
            const p = JSON.parse(cachedProfile);
            if(document.getElementById('age')) document.getElementById('age').value = p.age || '';
            if(document.getElementById('weight')) document.getElementById('weight').value = p.weight || '';
            if(document.getElementById('height')) document.getElementById('height').value = p.height || '';
            if(document.getElementById('gender')) document.getElementById('gender').value = p.gender || 'male';
            if(document.getElementById('goal')) document.getElementById('goal').value = p.goal || 'lose';
            if(document.getElementById('custom-calories')) document.getElementById('custom-calories').value = p.custom_calories || '';
            if(document.getElementById('custom-protein')) document.getElementById('custom-protein').value = p.custom_protein || '';
            if(document.getElementById('custom-fat')) document.getElementById('custom-fat').value = p.custom_fat || '';
            if(document.getElementById('custom-carbs')) document.getElementById('custom-carbs').value = p.custom_carbs || '';
            if(document.getElementById('custom-water-goal')) document.getElementById('custom-water-goal').value = p.custom_water_goal || '';
        }
        openScreen('profile-settings-screen');
    } catch (e) {
        console.error("Ошибка в настройках:", e);
        tg.showAlert("Не удалось открыть настройки.");
    }
} 

async function linkEmailToTelegram() {
    const email = document.getElementById('link-email').value;
    const password = document.getElementById('link-password').value;
    if (!email || !password) { tg.showAlert("Заполните Email и пароль!"); return; } 

    const currentTgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : localStorage.getItem('tgId');
    if (!currentTgId) { tg.showAlert("Ошибка: Telegram не найден."); return; } 

    const { data: emailCheck } = await supabaseClient.from('user_links').select('telegram_id').eq('email', email).maybeSingle();
    if (emailCheck && emailCheck.telegram_id && emailCheck.telegram_id != currentTgId) {
        tg.showAlert("Эта почта уже привязана к другому аккаунту Telegram!");
        return;
    } 

    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error && error.message !== "User already registered") {
            tg.showAlert("Ошибка: " + error.message);
        } else {
            const profile = JSON.parse(localStorage.getItem('cachedProfile'));
            const xp = parseInt(localStorage.getItem('cachedXP') || 0);
            const burned = parseInt(localStorage.getItem('cachedBurned') || 0);
            const name = localStorage.getItem('userName') || "Атлет"; 

            await saveProgressToCloud(currentTgId, email, name, profile, xp, burned);
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

    if (!tgId || !email) { tg.showAlert("Ошибка: не найден Email или Telegram ID."); return; } 

    const { data: tgCheck } = await supabaseClient.from('user_links').select('email').eq('telegram_id', tgId).maybeSingle();
    if (tgCheck && tgCheck.email && tgCheck.email !== email) {
        tg.showAlert("Этот Telegram уже привязан к другой почте!");
        return;
    } 

    const profile = JSON.parse(localStorage.getItem('cachedProfile'));
    const xp = parseInt(localStorage.getItem('cachedXP') || 0);
    const burned = parseInt(localStorage.getItem('cachedBurned') || 0); 

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
    const custom_water_goal = document.getElementById('custom-water-goal').value;
    
    if (!age || !weight || !height) { tg.showAlert("Заполни все поля!"); return; }
    const profile = { age, gender, weight, height, goal, custom_calories, custom_protein, custom_fat, custom_carbs, custom_water_goal: parseInt(custom_water_goal) || 2000 };
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
