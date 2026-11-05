const OFOX_API_KEY = 'sk-of-QZJLAGlHceOaKnlXuLZlbWqJkufzujxgNbAJqxOvGguKzTHeyQdZXaAcPmKOuTmo';

const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

let chartWaterDiary = null;
let chartFoodCalDiary = null;
let chartFoodMacroDiary = null;
let chartWeightDiary = null;
let chartGlobalWeight = null, chartGlobalCal = null, chartGlobalMacro = null, chartGlobalWater = null;

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
    if (tgId) { const { data } = await supabaseClient.from('user_links').select('*').eq('telegram_id', tgId); if (data) data.forEach(r => recordsMap.set(r.id, r)); }
    if (email) { const { data } = await supabaseClient.from('user_links').select('*').eq('email', email); if (data) data.forEach(r => recordsMap.set(r.id, r)); }
    let records = Array.from(recordsMap.values());
    let linkedTgId = tgId, linkedEmail = email;
    records.forEach(r => { if (r.telegram_id) linkedTgId = r.telegram_id; if (r.email) linkedEmail = r.email; });
    if (linkedTgId && linkedTgId !== tgId) { const { data } = await supabaseClient.from('user_links').select('*').eq('telegram_id', linkedTgId); if (data) data.forEach(r => recordsMap.set(r.id, r)); }
    if (linkedEmail && linkedEmail !== email) { const { data } = await supabaseClient.from('user_links').select('*').eq('email', linkedEmail); if (data) data.forEach(r => recordsMap.set(r.id, r)); }
    records = Array.from(recordsMap.values());
    if (records.length === 0) return null;
    if (records.length === 1) {
        const r = records[0]; let needsUpdate = false; let updateObj = {};
        if (tgId && !r.telegram_id) { updateObj.telegram_id = tgId; needsUpdate = true; }
        if (email && !r.email) { updateObj.email = email; needsUpdate = true; }
        if (needsUpdate) { await supabaseClient.from('user_links').update(updateObj).eq('id', r.id); Object.assign(r, updateObj); }
        return r;
    }
    let mergedFood = [], maxXp = 0, maxBurned = 0, profile = null, name = null;
    records.forEach(rec => {
        if (rec.food && Array.isArray(rec.food)) mergedFood = mergedFood.concat(rec.food);
        if (rec.xp && rec.xp > maxXp) maxXp = rec.xp;
        if (rec.burned && rec.burned > maxBurned) maxBurned = rec.burned;
        if (rec.profile && !profile) profile = rec.profile;
        if (rec.name && !name) name = rec.name;
    });
    const uniqueFood = [], seen = new Set();
    mergedFood.forEach(f => { const key = JSON.stringify(f); if (!seen.has(key)) { seen.add(key); uniqueFood.push(f); } });
    const mainRecord = records[0]; const idsToDelete = records.slice(1).map(r => r.id);
    const updateData = { telegram_id: linkedTgId || mainRecord.telegram_id || null, email: linkedEmail || mainRecord.email || null, food: uniqueFood, xp: maxXp, burned: maxBurned, profile: profile || mainRecord.profile, name: name || mainRecord.name || "Атлет" };
    await supabaseClient.from('user_links').update(updateData).eq('id', mainRecord.id);
    if (idsToDelete.length > 0) await supabaseClient.from('user_links').delete().in('id', idsToDelete);
    return { ...mainRecord, ...updateData };
}

window.addEventListener('load', async () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) renderProfile(JSON.parse(cachedProfile));
    await syncFoodFromCloud();
});

async function loginWithTelegram() {
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        localStorage.setItem('loginType', 'telegram');
        const tgId = tg.initDataUnsafe.user.id;
        const tgName = tg.initDataUnsafe.user.first_name || "Атлет";
        localStorage.setItem('tgId', tgId); localStorage.setItem('userName', tgName);
        const data = await resolveUserRecord(tgId, null);
        if (data && data.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(data.profile));
            localStorage.setItem('cachedXP', data.xp || 0); localStorage.setItem('cachedBurned', data.burned || 0);
            const today = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
            if (data.profile.water && data.profile.waterDate === today) {
                localStorage.setItem('todayWater', JSON.stringify(data.profile.water)); localStorage.setItem('waterListDate', today);
            } else { localStorage.setItem('todayWater', '[]'); localStorage.setItem('waterListDate', today); }
            if (data.email) { localStorage.setItem('linkedEmail', data.email); localStorage.setItem('currentEmail', data.email); } else { localStorage.removeItem('linkedEmail'); localStorage.removeItem('currentEmail'); }
            if (data.name) localStorage.setItem('userName', data.name);
            if (data.food) localStorage.setItem('todayFood', JSON.stringify(data.food));
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose', custom_water_goal: 2000, food_preference: '' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            localStorage.setItem('cachedXP', 0); localStorage.setItem('cachedBurned', 0);
            await saveProgressToCloud(tgId, null, tgName, defaultProfile, 0, 0);
            openOnboardingModal();
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        await syncFoodFromCloud();
    } else { tg.showAlert("Откройте через Telegram!"); }
}

function showEmailForm() { openScreen('email-screen'); }

async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('email-submit-btn');
    if (!email || !password) { tg.showAlert("Заполните все поля!"); return; }
    btn.innerText = "Загрузка..."; btn.disabled = true;
    try {
        let { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message.includes("Invalid login credentials")) {
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });
                if (signUpError) { tg.showAlert("Ошибка регистрации: " + signUpError.message); btn.innerText = "Продолжить"; btn.disabled = false; return; }
                if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) { tg.showAlert("Неверный пароль. Этот аккаунт уже существует."); btn.innerText = "Продолжить"; btn.disabled = false; return; }
                if (!signUpData.session) await supabaseClient.auth.signInWithPassword({ email, password });
                tg.showAlert("Аккаунт успешно создан!");
            } else { tg.showAlert("Ошибка входа: " + error.message); btn.innerText = "Продолжить"; btn.disabled = false; return; }
        } else { tg.showAlert("Успешный вход!"); }
        localStorage.setItem('loginType', 'email'); localStorage.setItem('currentEmail', email);
        const emailName = email.split('@')[0]; localStorage.setItem('userName', emailName);
        const linkData = await resolveUserRecord(null, email);
        if (linkData && linkData.profile) {
            localStorage.setItem('cachedProfile', JSON.stringify(linkData.profile));
            localStorage.setItem('cachedXP', linkData.xp || 0); localStorage.setItem('cachedBurned', linkData.burned || 0);
            const today = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
            if (linkData.profile.water && linkData.profile.waterDate === today) {
                localStorage.setItem('todayWater', JSON.stringify(linkData.profile.water)); localStorage.setItem('waterListDate', today);
            } else { localStorage.setItem('todayWater', '[]'); localStorage.setItem('waterListDate', today); }
            if (linkData.telegram_id) { localStorage.setItem('tgId', linkData.telegram_id); localStorage.setItem('linkedEmail', email); } else { localStorage.removeItem('tgId'); }
            if (linkData.name) localStorage.setItem('userName', linkData.name);
            if (linkData.food) localStorage.setItem('todayFood', JSON.stringify(linkData.food));
        } else {
            const defaultProfile = { age: 25, gender: 'male', weight: 70, height: 175, goal: 'lose', custom_water_goal: 2000, food_preference: '' };
            localStorage.setItem('cachedProfile', JSON.stringify(defaultProfile));
            localStorage.setItem('cachedXP', 0); localStorage.setItem('cachedBurned', 0);
            await saveProgressToCloud(null, email, emailName, defaultProfile, 0, 0);
            openOnboardingModal();
        }
        renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
        await syncFoodFromCloud();
    } catch (e) { tg.showAlert("Ошибка сети."); } finally { btn.innerText = "Продолжить"; btn.disabled = false; }
}

function openOnboardingModal() { setTimeout(() => { document.getElementById('onboarding-modal').classList.add('active'); }, 500); }

async function saveOnboardingData() {
    const age = document.getElementById('onboarding-age').value;
    const weight = document.getElementById('onboarding-weight').value;
    const height = document.getElementById('onboarding-height').value;
    const gender = document.getElementById('onboarding-gender').value;
    const goal = document.getElementById('onboarding-goal').value;
    const food_preference = document.getElementById('onboarding-food-preference').value;
    if (!age || !weight || !height) { tg.showAlert("Пожалуйста, заполни возраст, вес и рост!"); return; }
    const calculatedWater = weight ? Math.round(parseFloat(weight) * 30) : 2000;
    const profile = { age, gender, weight, height, goal, custom_calories: '', custom_protein: '', custom_fat: '', custom_carbs: '', custom_water_goal: calculatedWater, food_preference };
    localStorage.setItem('cachedProfile', JSON.stringify(profile));
    const tgId = localStorage.getItem('tgId'); const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
    const name = localStorage.getItem('userName') || "Атлет";
    await saveProgressToCloud(tgId, email, name, profile, 0, 0);
    document.getElementById('onboarding-modal').classList.remove('active');
    renderProfile(profile);
    tg.showAlert("Отлично! Твоя норма воды рассчитана автоматически.");
}async function syncFoodFromCloud() {
    const tgId = localStorage.getItem('tgId');
    const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    if (!tgId && !email) return;
    const record = await resolveUserRecord(tgId, email);
    let localFood = []; try { localFood = JSON.parse(localStorage.getItem('todayFood') || '[]'); } catch(e) {}
    const now = new Date(); const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const savedDate = localStorage.getItem('foodListDate');
    if (record) {
        const cloudFood = record.food || [];
        if (!savedDate) {
            if (cloudFood.length > 0) localStorage.setItem('todayFood', JSON.stringify(cloudFood));
            else if (localFood.length > 0) await supabaseClient.from('user_links').update({ food: localFood }).eq('id', record.id);
            localStorage.setItem('foodListDate', today);
        } else if (savedDate === today) {
            if (cloudFood.length > 0) localStorage.setItem('todayFood', JSON.stringify(cloudFood));
            else if (localFood.length > 0) await supabaseClient.from('user_links').update({ food: localFood }).eq('id', record.id);
        } else {
            archiveFoodToHistory(localFood, savedDate); localStorage.setItem('todayFood', '[]'); localStorage.setItem('foodListDate', today);
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
    if (record) await supabaseClient.from('user_links').update({ food: foodArray }).eq('id', record.id);
}

async function syncWaterToProfile() {
    let todayWater = []; try { todayWater = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    const today = localStorage.getItem('waterListDate'); let prof = JSON.parse(localStorage.getItem('cachedProfile') || '{}');
    prof.water = todayWater; prof.waterDate = today; localStorage.setItem('cachedProfile', JSON.stringify(prof));
    const tgId = localStorage.getItem('tgId'); const email = localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
    const name = localStorage.getItem('userName') || "Атлет";
    await saveProgressToCloud(tgId, email, name, prof, currentXP, totalBurnedCalories);
}

async function saveProgressToCloud(tgId, email, name, profile, xp, burned) {
    try {
        let currentTgId = tgId || localStorage.getItem('tgId'); let currentEmail = email || localStorage.getItem('linkedEmail') || localStorage.getItem('currentEmail');
        let currentName = name || localStorage.getItem('userName') || "Атлет";
        if (!currentTgId && !currentEmail) return;
        const existing = await resolveUserRecord(currentTgId, currentEmail);
        if (existing) {
            await supabaseClient.from('user_links').update({
                profile: profile, xp: xp, burned: burned, name: currentName, telegram_id: currentTgId || null, email: currentEmail || null
            }).eq('id', existing.id);
        } else {
            await supabaseClient.from('user_links').insert([{
                telegram_id: currentTgId, email: currentEmail, profile: profile, xp: xp, burned: burned, name: currentName
            }]);
        }
    } catch (e) { console.log("Ошибка сохранения:", e); }
}

const levelsData = {
    male: [{ xp: 0, title: "Странник", video: "VID_20261028_173134_198.mp4" }, { xp: 100, title: "Берсерк", video: "VID_20261028_173215_440.mp4" }],
    female: [{ xp: 0, title: "Новичок", video: "VID_20261028_175618_746.mp4" }, { xp: 100, title: "Фурия", video: "VID_20261028_175631_701.mp4" }]
};

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male'; let currentProfileData = null;
let currentLevelIndex = -1;

function calculateNutrition(profile) {
    if (profile.custom_calories && profile.custom_calories > 0) {
        return { calories: parseInt(profile.custom_calories), protein: parseInt(profile.custom_protein) || 0, fat: parseInt(profile.custom_fat) || 0, carbs: parseInt(profile.custom_carbs) || 0 };
    }
    let w = parseFloat(profile.weight) || 70;
    let h = parseFloat(profile.height) || 175;
    let a = parseInt(profile.age) || 25;
    let bmr = profile.gender === 'male' ? (10 * w + 6.25 * h - 5 * a + 5) : (10 * w + 6.25 * h - 5 * a - 161);
    let tdee = bmr * 1.375;
    if (profile.goal === 'lose') tdee -= 500;
    if (profile.goal === 'gain') tdee += 500;
    return { calories: Math.round(tdee), protein: Math.round((tdee * 0.30) / 4), fat: Math.round((tdee * 0.30) / 9), carbs: Math.round((tdee * 0.40) / 4) };
}

function checkDayReset() {
    const now = new Date(); const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (localStorage.getItem('foodListDate') !== today) { localStorage.setItem('todayFood', '[]'); localStorage.setItem('foodListDate', today); }
    if (localStorage.getItem('waterListDate') !== today) { localStorage.setItem('todayWater', '[]'); localStorage.setItem('waterListDate', today); }
}

function saveWeightToHistory(weight) {
    let history = []; try { history = JSON.parse(localStorage.getItem('weightHistory') || '[]'); } catch(e) { history = []; }
    const now = new Date(); const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    if (history.length > 0 && history[0].dateRaw === dateStr) { history[0].weight = parseFloat(weight); }
    else { history.unshift({ dateRaw: dateStr, dateDisplay: now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }), weight: parseFloat(weight) }); }
    if (history.length > 50) history.pop();
    localStorage.setItem('weightHistory', JSON.stringify(history));
}

function openWeightDiary() {
    if (currentProfileData && document.getElementById('modal-weight-input')) document.getElementById('modal-weight-input').value = currentProfileData.weight || '';
    setPeriod('weight', '7days');
    openScreen('weight-diary-screen');
}

async function saveWeightFromDiary() {
    const newWeight = parseFloat(document.getElementById('modal-weight-input').value);
    if (!newWeight || newWeight <= 0) { tg.showAlert("Введите корректный вес!"); return; }
    if (currentProfileData) {
        currentProfileData.weight = newWeight; localStorage.setItem('cachedProfile', JSON.stringify(currentProfileData));
        saveWeightToHistory(newWeight);
        await saveProgressToCloud(localStorage.getItem('tgId'), localStorage.getItem('currentEmail'), localStorage.getItem('userName'), currentProfileData, currentXP, totalBurnedCalories);
        updateDashboard(); renderWeightDiary(); tg.showAlert("Вес обновлен!");
    }
}

function renderWeightDiary() {
    const start = document.getElementById('weight-start-date').value;
    const end = document.getElementById('weight-end-date').value;
    if (!start || !end) return;

    let history = []; try { history = JSON.parse(localStorage.getItem('weightHistory') || '[]'); } catch(e) { history = []; }

    const labels = []; const data = [];
    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr.split('-').slice(1).reverse().join('.'));
        const rec = history.find(h => h.dateRaw === dateStr || (h.date && h.date.split('.').reverse().join('-') === dateStr));
        if (rec) data.push(rec.weight); else { const last = data.filter(v=>v!==null).pop(); data.push(last || null); }
    }

    if (chartWeightDiary) chartWeightDiary.destroy();
    chartWeightDiary = new Chart(document.getElementById('weight-diary-chart').getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Вес', data: data, borderColor: '#ffcc00', backgroundColor: '#ffcc0033', borderWidth: 2, pointBackgroundColor: '#fff', pointBorderColor: '#ffcc00', pointRadius: 3, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } } } }
    });

    const validData = data.filter(v => v !== null);
    const diffDiv = document.getElementById('weight-diff');
    const summaryDiv = document.getElementById('weight-summary');
    if (validData.length > 1) {
        summaryDiv.style.display = 'block';
        const diff = (validData[validData.length - 1] - validData[0]).toFixed(1);
        if (diff > 0) diffDiv.innerHTML = `Набрано: <span style="color: #ff3b30;">+${diff} кг</span>`;
        else if (diff < 0) diffDiv.innerHTML = `Сброшено: <span style="color: #34c759;">${diff} кг</span>`;
        else diffDiv.innerHTML = "Вес не изменился";
    } else { summaryDiv.style.display = 'none'; }

    const listDiv = document.getElementById('weight-diary-list');
    let listHtml = '';
    history.filter(h => h.dateRaw >= start && h.dateRaw <= end).forEach(h => {
        listHtml += `<div class="history-weight-item"> <span style="color: var(--accent-color);">${h.dateDisplay || h.date}</span> <span>${h.weight} кг</span> </div>`;
    });
    listDiv.innerHTML = listHtml || '<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function updateCustomWaterBtn() {
    const btn = document.getElementById('custom-water-quick-btn'); if (!btn) return;
    const saved = localStorage.getItem('customWaterAmount');
    if (saved && parseInt(saved) > 0) btn.innerText = `+${saved}`; else btn.innerText = "+Своя";
}
function quickAddCustomWater() {
    const customAmount = localStorage.getItem('customWaterAmount');
    if (customAmount && parseInt(customAmount) > 0) addWater(customAmount); else openWaterDiary();
}
function addWater(amount) {
    let waterArr = []; try { waterArr = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    waterArr.push({ amount: parseInt(amount), time: new Date().toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) });
    localStorage.setItem('todayWater', JSON.stringify(waterArr));
    syncWaterToProfile(); updateDashboard();
    const today = localStorage.getItem('waterListDate'); archiveWaterToHistory(waterArr, today);
}
function deleteWaterItem(index) {
    let waterArr = []; try { waterArr = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    waterArr.splice(index, 1); localStorage.setItem('todayWater', JSON.stringify(waterArr));
    syncWaterToProfile(); updateDashboard();
    const today = localStorage.getItem('waterListDate'); archiveWaterToHistory(waterArr, today);
    renderTodayWaterList(waterArr);
}
function openWaterDiary() {
    setPeriod('water', '7days');
    renderTodayWaterList(JSON.parse(localStorage.getItem('todayWater') || '[]'));
    openScreen('water-diary-screen');
}
function addWaterFromDiary() {
    const val = parseInt(document.getElementById('custom-water-input').value);
    if (val && val > 0) { localStorage.setItem('customWaterAmount', val); updateCustomWaterBtn(); addWater(val); document.getElementById('custom-water-input').value = ''; }
    else tg.showAlert("Введите корректный объем!");
}

function renderWaterDiary() {
    const start = document.getElementById('water-start-date').value;
    const end = document.getElementById('water-end-date').value;
    if (!start || !end) return;

    let hist = {}; try { hist = JSON.parse(localStorage.getItem('waterHistory') || '{}'); } catch(e) {}
    const labels = []; const data = []; let total = 0;

    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr.split('-').slice(1).reverse().join('.'));
        let sum = 0; (hist[dateStr] || []).forEach(w => sum += parseInt(w.amount || 0));
        data.push(sum);
        total += sum;
    }

    if (chartWaterDiary) chartWaterDiary.destroy();
    chartWaterDiary = new Chart(document.getElementById('water-diary-chart').getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Вода', data: data, borderColor: '#5ac8fa', backgroundColor: '#5ac8fa33', borderWidth: 2, pointBackgroundColor: '#fff', pointBorderColor: '#5ac8fa', pointRadius: 3, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true } } }
    });

    document.getElementById('water-summary').style.display = 'block';
    document.getElementById('water-total-ml').innerText = total;

    const listDiv = document.getElementById('water-diary-list');
    let listHtml = '';
    const dates = Object.keys(hist).filter(date => date >= start && date <= end).sort((a, b) => new Date(b) - new Date(a));
    dates.forEach(date => {
        const waters = hist[date] || [];
        if (waters.length === 0) return;
        let dayTotal = 0; waters.forEach(w => dayTotal += parseInt(w.amount));

        listHtml += `<div class="history-card"><div class="history-date">📅${date.split('-').reverse().join('.')} <span style="float:right; font-size: 12px; color:#5ac8fa;">${dayTotal} мл</span></div>`;
        waters.forEach(w => { listHtml += `<div class="history-water-item"><span>💧 Вода</span><span style="color:#8e8e93;">${w.amount} мл (${w.time || ''})</span></div>`; });
        listHtml += `</div>`;
    });
    listDiv.innerHTML = listHtml || '<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function openFoodDiary() {
    setPeriod('food', '7days');
    openScreen('food-diary-screen');
}

function renderFoodDiary() {
    const start = document.getElementById('food-start-date').value;
    const end = document.getElementById('food-end-date').value;
    if (!start || !end) return;

    let hist = {}; try { hist = JSON.parse(localStorage.getItem('foodHistory') || '{}'); } catch(e) {}
    const labels = []; const calData = []; const protData = []; const fatData = []; const carbData = [];
    let totalCal = 0, totalProt = 0, totalFat = 0, totalCarb = 0;

    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr.split('-').slice(1).reverse().join('.'));
        const foods = hist[dateStr] || [];
        let c = 0, p = 0, f = 0, cb = 0;
        foods.forEach(food => { c+=parseFloat(food.calories_100g||0); p+=parseFloat(food.proteins_100g||0); f+=parseFloat(food.fat_100g||0); cb+=parseFloat(food.carbs_100g||0); });
        calData.push(Math.round(c)); protData.push(Math.round(p)); fatData.push(Math.round(f)); carbData.push(Math.round(cb));
        totalCal += c; totalProt += p; totalFat += f; totalCarb += cb;
    }

    if (chartFoodCalDiary) chartFoodCalDiary.destroy();
    chartFoodCalDiary = new Chart(document.getElementById('food-diary-cal-chart').getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Калории', data: calData, borderColor: '#ff3b30', backgroundColor: '#ff3b3033', borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Калории', color: '#fff' } }, scales: { x: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true } } }
    });

    if (chartFoodMacroDiary) chartFoodMacroDiary.destroy();
    chartFoodMacroDiary = new Chart(document.getElementById('food-diary-macro-chart').getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: [
            { label: 'Белки', data: protData, borderColor: '#34c759', borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3 },
            { label: 'Жиры', data: fatData, borderColor: '#ff9500', borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3 },
            { label: 'Углеводы', data: carbData, borderColor: '#af52de', borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } }, title: { display: true, text: 'БЖУ', color: '#fff' } }, scales: { x: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' }, beginAtZero: true } } }
    });

    document.getElementById('food-summary').style.display = 'block';
    document.getElementById('food-total-cal').innerText = Math.round(totalCal);
    document.getElementById('food-total-prot').innerText = Math.round(totalProt);
    document.getElementById('food-total-fat').innerText = Math.round(totalFat);
    document.getElementById('food-total-carb').innerText = Math.round(totalCarb);

    const listDiv = document.getElementById('food-diary-list');
    let listHtml = '';
    const dates = Object.keys(hist).filter(date => date >= start && date <= end).sort((a, b) => new Date(b) - new Date(a));
    dates.forEach(date => {
        const foods = hist[date] || [];
        if (foods.length === 0) return;
        let dayCal = 0, dayProt = 0, dayFat = 0, dayCarb = 0;
        foods.forEach(f => { dayCal+=parseFloat(f.calories_100g||0); dayProt+=parseFloat(f.proteins_100g||0); dayFat+=parseFloat(f.fat_100g||0); dayCarb+=parseFloat(f.carbs_100g||0); });
        listHtml += `<div class="history-card"><div class="history-date">📅${date.split('-').reverse().join('.')}</div>`;
        listHtml += `<div><span style="color: var(--accent-color); font-weight: bold;">${Math.round(dayCal)}</span><br><span style="font-size: 10px; color: #8e8e93;">Ккал</span></div>`;
        listHtml += `<div><span style="color: #fff; font-weight: bold;">${Math.round(dayProt)}</span><br><span style="font-size: 10px; color: #8e8e93;">Бел.</span></div>`;
        listHtml += `<div><span style="color: #fff; font-weight: bold;">${Math.round(dayFat)}</span><br><span style="font-size: 10px; color: #8e8e93;">Жир.</span></div>`;
        listHtml += `<div><span style="color: #fff; font-weight: bold;">${Math.round(dayCarb)}</span><br><span style="font-size: 10px; color: #8e8e93;">Угл.</span></div>`;
        listHtml += `</div>`;
        foods.forEach(f => { listHtml += `<div class="history-food-item"><span>${f.product_name}</span><span style="color: #8e8e93;">${Math.round(f.calories_100g || 0)} ккал</span></div>`; });
        listHtml += `</div>`;
    });
    listDiv.innerHTML = listHtml || '<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function openGlobalStatsModal() {
    const now = new Date(); const past = new Date(); past.setDate(now.getDate() - 7);
    document.getElementById('global-start-date').value = past.toISOString().split('T')[0];
    document.getElementById('global-end-date').value = now.toISOString().split('T')[0];
    openScreen('global-stats-screen');
    setTimeout(() => { renderAllCharts(); }, 100);
}
function renderAllCharts() {
    if (typeof Chart === 'undefined') return;
    const start = document.getElementById('global-start-date').value;
    const end = document.getElementById('global-end-date').value;
    if (!start || !end) return;

    let foodHist = {}; try { foodHist = JSON.parse(localStorage.getItem('foodHistory') || '{}'); } catch(e) {}
    let waterHist = {}; try { waterHist = JSON.parse(localStorage.getItem('waterHistory') || '{}'); } catch(e) {}
    let weightHist = []; try { weightHist = JSON.parse(localStorage.getItem('weightHistory') || '[]'); } catch(e) {}

    const labels = []; const wData = []; const cData = []; const pData = []; const fData = []; const cbData = []; const hData = [];

    for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(dateStr.split('-').slice(1).reverse().join('.'));
        const wRec = weightHist.find(h => h.dateRaw === dateStr || (h.date && h.date.split('.').reverse().join('-') === dateStr));
        if (wRec) wData.push(wRec.weight); else { const last = wData.filter(v=>v!==null).pop(); wData.push(last||null); }
        let c=0,p=0,f=0,cb=0; (foodHist[dateStr]||[]).forEach(food=>{c+=parseFloat(food.calories_100g||0);p+=parseFloat(food.proteins_100g||0);f+=parseFloat(food.fat_100g||0);cb+=parseFloat(food.carbs_100g||0);});
        cData.push(Math.round(c)); pData.push(Math.round(p)); fData.push(Math.round(f)); cbData.push(Math.round(cb));
        let h=0; (waterHist[dateStr]||[]).forEach(water=>h+=parseInt(water.amount||0));
        hData.push(h);
    }

    const baseOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } }, y: { ticks: { color: '#8e8e93' }, grid: { color: 'rgba(255,255,255,0.1)' } } } };

    if (chartGlobalWeight) chartGlobalWeight.destroy();
    chartGlobalWeight = new Chart(document.getElementById('g-weight-chart').getContext('2d'), { type:'line', data:{labels,datasets:[{label:'Вес',data:wData,borderColor:'#ffcc00',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]}, options:{...baseOpts, plugins:{...baseOpts.plugins, title:{display:true,text:'Вес (кг)',color:'#fff'}}} });
    if (chartGlobalCal) chartGlobalCal.destroy();
    chartGlobalCal = new Chart(document.getElementById('g-calories-chart').getContext('2d'), { type:'line', data:{labels,datasets:[{label:'Калории',data:cData,borderColor:'#ff3b30',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]}, options:{...baseOpts, plugins:{...baseOpts.plugins, title:{display:true,text:'Калории (ккал)',color:'#fff'}}, scales:{...baseOpts.scales, y:{...baseOpts.scales.y, beginAtZero:true}}} });
    if (chartGlobalMacro) chartGlobalMacro.destroy();
    chartGlobalMacro = new Chart(document.getElementById('g-macros-chart').getContext('2d'), { type:'line', data:{labels,datasets:[{label:'Белки',data:pData,borderColor:'#34c759',borderWidth:2,pointRadius:2,fill:false,tension:0.3},{label:'Жиры',data:fData,borderColor:'#ff9500',borderWidth:2,pointRadius:2,fill:false,tension:0.3},{label:'Углеводы',data:cbData,borderColor:'#af52de',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]}, options:{...baseOpts, plugins:{...baseOpts.plugins, legend:{labels:{color:'#fff'}}, title:{display:true,text:'БЖУ (граммы)',color:'#fff'}}, scales:{...baseOpts.scales, y:{...baseOpts.scales.y, beginAtZero:true}}} });
    if (chartGlobalWater) chartGlobalWater.destroy();
    chartGlobalWater = new Chart(document.getElementById('g-water-chart').getContext('2d'), { type:'line', data:{labels,datasets:[{label:'Вода',data:hData,borderColor:'#5ac8fa',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]}, options:{...baseOpts, plugins:{...baseOpts.plugins, title:{display:true,text:'Вода (мл)',color:'#fff'}}, scales:{...baseOpts.scales, y:{...baseOpts.scales.y, beginAtZero:true}}} });
}

function setPeriod(type, period) {
    const startInput = document.getElementById(type + '-start-date'); const endInput = document.getElementById(type + '-end-date');
    const now = new Date(); endInput.value = now.toISOString().split('T')[0];
    if (period === '7days') { const past = new Date(now); past.setDate(now.getDate() - 7); startInput.value = past.toISOString().split('T')[0]; }
    else if (period === '30days') { const past = new Date(now); past.setDate(now.getDate() - 30); startInput.value = past.toISOString().split('T')[0]; }
    else if (period === 'month') { const firstDay = new Date(now.getFullYear(), now.getMonth(), 1); startInput.value = firstDay.toISOString().split('T')[0]; }

    if (type === 'water') renderWaterDiary();
    if (type === 'food') renderFoodDiary();
    if (type === 'weight') renderWeightDiary();
}

function archiveFoodToHistory(foodArray, dateString) {
    if (!foodArray || foodArray.length === 0 || !dateString) return;
    let history = {}; try { history = JSON.parse(localStorage.getItem('foodHistory') || '{}'); } catch(e) {}
    history[dateString] = foodArray; localStorage.setItem('foodHistory', JSON.stringify(history));
}
function archiveWaterToHistory(waterArray, dateString) {
    if (!waterArray || waterArray.length === 0 || !dateString) return;
    let history = {}; try { history = JSON.parse(localStorage.getItem('waterHistory') || '{}'); } catch(e) {}
    history[dateString] = waterArray; localStorage.setItem('waterHistory', JSON.stringify(history));
}

function updateDashboard() {
    if (!currentProfileData) return; checkDayReset();
    if (document.getElementById('current-weight-display')) document.getElementById('current-weight-display').innerText = currentProfileData.weight || 0;
    updateCustomWaterBtn();
    const norm = calculateNutrition(currentProfileData);
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]');
    const savedDate = localStorage.getItem('foodListDate');
    if (savedDate && todayFood.length > 0) archiveFoodToHistory(todayFood, savedDate);
    let eatenCal = 0, eatenProt = 0, eatenFat = 0, eatenCarb = 0;
    todayFood.forEach(food => { eatenCal += parseFloat(food.calories_100g || 0); eatenProt += parseFloat(food.proteins_100g || 0); eatenFat += parseFloat(food.fat_100g || 0); eatenCarb += parseFloat(food.carbs_100g || 0); });
    if (document.getElementById('norm-cal')) { document.getElementById('norm-cal').innerText = norm.calories; document.getElementById('norm-prot').innerText = norm.protein; document.getElementById('norm-fat').innerText = norm.fat; document.getElementById('norm-carb').innerText = norm.carbs; }
    const setValue = (id, eaten, normVal) => { const el = document.getElementById(id); if (el) { el.innerText = Math.round(eaten); el.style.color = (eaten > normVal) ? '#ff3b30' : '#fff'; } };
    setValue('eaten-cal', eatenCal, norm.calories); setValue('eaten-prot', eatenProt, norm.protein); setValue('eaten-fat', eatenFat, norm.fat); setValue('eaten-carb', eatenCarb, norm.carbs);
    if (document.getElementById('calories-norm')) document.getElementById('calories-norm').innerText = norm.calories + " ккал";
    renderTodayFoodList(todayFood);
    let todayWater = []; try { todayWater = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e) {}
    const waterDate = localStorage.getItem('waterListDate');
    if (waterDate && todayWater.length > 0) archiveWaterToHistory(todayWater, waterDate);
    let eatenWater = 0; todayWater.forEach(w => eatenWater += parseInt(w.amount || 0));
    const waterGoal = currentProfileData.custom_water_goal || 2000;
    if (document.getElementById('eaten-water')) document.getElementById('eaten-water').innerText = eatenWater;
    if (document.getElementById('norm-water')) document.getElementById('norm-water').innerText = waterGoal;
    renderTodayWaterList(todayWater);
}

function renderTodayFoodList(todayFood) {
    const listDiv = document.getElementById('today-food-list'); if (!listDiv) return;
    if (todayFood.length === 0) { listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не съедено</p>'; return; }
    let html = ''; todayFood.forEach((food, index) => { html += `<div class="compact-food-item"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 85%;">${food.product_name}</div><button onclick="event.stopPropagation(); deleteFoodItem(${index})" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>`; });
    listDiv.innerHTML = html;
}
function renderTodayWaterList(todayWater) {
    const listDiv = document.getElementById('today-water-list'); if (!listDiv) return;
    if (todayWater.length === 0) { listDiv.innerHTML = '<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не выпито</p>'; return; }
    let html = ''; todayWater.forEach((w, index) => { html += `<div class="compact-food-item" style="border-left: 2px solid #5ac8fa;"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">💧 ${w.amount} мл (${w.time})</div><button onclick="event.stopPropagation(); deleteWaterItem(${index})" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>`; });
    listDiv.innerHTML = html;
}
function deleteFoodItem(index) {
    let todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]'); todayFood.splice(index, 1);
    localStorage.setItem('todayFood', JSON.stringify(todayFood)); saveFoodToCloud(todayFood); updateDashboard();
}
function openCustomNormModal() {
    if (!currentProfileData) return;
    document.getElementById('modal-calories').value = currentProfileData.custom_calories || ''; document.getElementById('modal-protein').value = currentProfileData.custom_protein || '';
    document.getElementById('modal-fat').value = currentProfileData.custom_fat || ''; document.getElementById('modal-carbs').value = currentProfileData.custom_carbs || '';
    document.getElementById('norm-modal').classList.add('active');
}
function closeCustomNormModal() { document.getElementById('norm-modal').classList.remove('active'); }
function saveCustomNormFromModal() {
    if (!currentProfileData) return;
    currentProfileData.custom_calories = document.getElementById('modal-calories').value; currentProfileData.custom_protein = document.getElementById('modal-protein').value;
    currentProfileData.custom_fat = document.getElementById('modal-fat').value; currentProfileData.custom_carbs = document.getElementById('modal-carbs').value;
    localStorage.setItem('cachedProfile', JSON.stringify(currentProfileData));
    saveProgressToCloud(localStorage.getItem('tgId'), localStorage.getItem('currentEmail'), localStorage.getItem('userName'), currentProfileData, currentXP, totalBurnedCalories);
    updateDashboard(); closeCustomNormModal();
}

function renderProfile(profile) {
    currentProfileData = profile; userGender = profile.gender || 'male';
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';
    currentXP = parseInt(localStorage.getItem('cachedXP') || 0); totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);
    if (document.getElementById('burned-total')) document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    updateDashboard(); updateCharacterUI(); openScreen('dashboard-screen');
    setTimeout(() => {
        const videoElement = document.getElementById('character-video');
        if (videoElement) {
            const levels = levelsData[userGender]; let newLevelIndex = 0;
            for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
            const currentLevel = levels[newLevelIndex];
            if (videoElement.src.indexOf(currentLevel.video) === -1) { videoElement.src = currentLevel.video; videoElement.load(); videoElement.play().catch(e => console.log("Autoplay blocked")); }
        }
    }, 1000);
    
    setTimeout(() => {
        showSenseiAdvice();
    }, 1500);
}

function updateCharacterUI() {
    const levels = levelsData[userGender]; let newLevelIndex = 0;
    for (let i = 0; i < levels.length; i++) { if (currentXP >= levels[i].xp) newLevelIndex = i; }
    const currentLevel = levels[newLevelIndex];

    if (currentLevelIndex !== -1 && newLevelIndex > currentLevelIndex) {
        setTimeout(() => {
            showSenseiAdvice("Поздравляю с новым уровнем, воин! Ты становишься сильнее. Продолжай в том же духе.");
        }, 1000);
    }
    currentLevelIndex = newLevelIndex;

    if (document.getElementById('char-level')) document.getElementById('char-level').innerText = "Уровень " + (newLevelIndex + 1);
    if (document.getElementById('char-title')) document.getElementById('char-title').innerText = currentLevel.title;
    if (document.getElementById('xp-text')) document.getElementById('xp-text').innerText = currentXP + " XP";
    let nextLevelXp = 100; if (newLevelIndex + 1 < levels.length) nextLevelXp = levels[newLevelIndex + 1].xp;
    let percent = (currentXP / nextLevelXp) * 100; if (percent > 100) percent = 100;
    if (document.getElementById('xp-bar')) document.getElementById('xp-bar').style.width = percent + "%";
}function openProfileSettings() {
    try {
        const loginType = localStorage.getItem('loginType') || 'telegram';
        if (loginType === 'telegram') {
            document.getElementById('link-title').innerText = "Привязка Email";
            document.getElementById('link-desc').innerText = "Привяжите Email, чтобы заходить с любого устройства.";
            const linked = localStorage.getItem('linkedEmail');
            if (linked) {
                document.getElementById('link-email-form').innerHTML = `<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Email привязан: ${linked}</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkEmail()">Отвязать Email</button>`;
            } else {
                document.getElementById('link-email-form').innerHTML = `<div class="form-group" style="margin-bottom: 10px;"><input type="email" id="link-email" placeholder="your@email.com" style="padding: 10px;"></div><div class="form-group" style="margin-bottom: 10px;"><input type="password" id="link-password" placeholder="Пароль (мин. 6 символов)" style="padding: 10px;"></div><button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkEmailToTelegram()">Привязать Email</button>`;
            }
            document.getElementById('link-email-form').style.display = 'block'; document.getElementById('link-tg-form').style.display = 'none';
        } else {
            document.getElementById('link-title').innerText = "Привязка Telegram";
            document.getElementById('link-desc').innerText = "Ваш Telegram ID для входа с телефона.";
            const tgId = localStorage.getItem('tgId');
            if (tgId) {
                document.getElementById('link-tg-form').innerHTML = `<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Telegram привязан: ${tgId}</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkTelegram()">Отвязать Telegram</button>`;
            } else if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                document.getElementById('link-tg-form').innerHTML = `<p style="font-size: 14px; color: #fff; margin-bottom: 10px;">Ваш Telegram ID: <b>${tg.initDataUnsafe.user.id}</b></p><button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkTelegramToEmail()">Привязать Telegram</button>`;
            }
            document.getElementById('link-email-form').style.display = 'none'; document.getElementById('link-tg-form').style.display = 'block';
        }
        const cachedProfile = localStorage.getItem('cachedProfile');
        if (cachedProfile) {
            const p = JSON.parse(cachedProfile);
            if(document.getElementById('age')) document.getElementById('age').value = p.age || ''; if(document.getElementById('weight')) document.getElementById('weight').value = p.weight || '';
            if(document.getElementById('height')) document.getElementById('height').value = p.height || ''; if(document.getElementById('gender')) document.getElementById('gender').value = p.gender || 'male';
            if(document.getElementById('goal')) document.getElementById('goal').value = p.goal || 'lose'; if(document.getElementById('custom-calories')) document.getElementById('custom-calories').value = p.custom_calories || '';
            if(document.getElementById('custom-protein')) document.getElementById('custom-protein').value = p.custom_protein || ''; if(document.getElementById('custom-fat')) document.getElementById('custom-fat').value = p.custom_fat || '';
            if(document.getElementById('custom-carbs')) document.getElementById('custom-carbs').value = p.custom_carbs || ''; if(document.getElementById('custom-water-goal')) document.getElementById('custom-water-goal').value = p.custom_water_goal || '';
            if(document.getElementById('food-preference')) document.getElementById('food-preference').value = p.food_preference || '';
        }
        openScreen('profile-settings-screen');
    } catch (e) { tg.showAlert("Не удалось открыть настройки."); }
}

async function linkEmailToTelegram() {
    const email = document.getElementById('link-email').value; const password = document.getElementById('link-password').value;
    if (!email || !password) { tg.showAlert("Заполните Email и пароль!"); return; }
    const currentTgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : localStorage.getItem('tgId');
    if (!currentTgId) { tg.showAlert("Ошибка: Telegram не найден."); return; }
    const { data: emailCheck } = await supabaseClient.from('user_links').select('telegram_id').eq('email', email).maybeSingle();
    if (emailCheck && emailCheck.telegram_id && emailCheck.telegram_id != currentTgId) { tg.showAlert("Эта почта уже привязана к другому аккаунту Telegram!"); return; }
    try {
        const { error } = await supabaseClient.auth.signUp({ email, password });
        if (error && error.message !== "User already registered") { tg.showAlert("Ошибка: " + error.message); }
        else {
            const profile = JSON.parse(localStorage.getItem('cachedProfile')); const xp = parseInt(localStorage.getItem('cachedXP') || 0);
            const burned = parseInt(localStorage.getItem('cachedBurned') || 0); const name = localStorage.getItem('userName') || "Атлет";
            await saveProgressToCloud(currentTgId, email, name, profile, xp, burned);
            localStorage.setItem('linkedEmail', email); localStorage.setItem('currentEmail', email);
            tg.showAlert("Email успешно привязан!"); openProfileSettings();
        }
    } catch (e) { tg.showAlert("Ошибка сети."); }
}
async function linkTelegramToEmail() {
    const tgId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : null;
    const tgName = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.first_name : "Атлет";
    const email = localStorage.getItem('currentEmail') || localStorage.getItem('linkedEmail');
    if (!tgId || !email) { tg.showAlert("Ошибка: не найден Email или Telegram ID."); return; }
    const { data: tgCheck } = await supabaseClient.from('user_links').select('email').eq('telegram_id', tgId).maybeSingle();
    if (tgCheck && tgCheck.email && tgCheck.email !== email) { tg.showAlert("Этот Telegram уже привязан к другой почте!"); return; }
    const profile = JSON.parse(localStorage.getItem('cachedProfile')); const xp = parseInt(localStorage.getItem('cachedXP') || 0);
    const burned = parseInt(localStorage.getItem('cachedBurned') || 0);
    await saveProgressToCloud(tgId, email, tgName, profile, xp, burned);
    localStorage.setItem('tgId', tgId); localStorage.setItem('userName', tgName);
    tg.showAlert("Telegram успешно привязан!"); openProfileSettings();
}
async function unlinkEmail() {
    if (!confirm("Отвязать Email? Прогресс останется в Telegram.")) return;
    const tgId = localStorage.getItem('tgId'); if (tgId) { const record = await resolveUserRecord(tgId, null); if (record) await supabaseClient.from('user_links').update({ email: null }).eq('id', record.id); }
    localStorage.removeItem('linkedEmail'); localStorage.removeItem('currentEmail'); tg.showAlert("Email отвязан."); openProfileSettings();
}
async function unlinkTelegram() {
    if (!confirm("Отвязать Telegram? Прогресс останется в Email.")) return;
    const email = localStorage.getItem('currentEmail'); if (email) { const record = await resolveUserRecord(null, email); if (record) await supabaseClient.from('user_links').update({ telegram_id: null }).eq('id', record.id); }
    localStorage.removeItem('tgId'); tg.showAlert("Telegram отвязан."); openProfileSettings();
}
async function saveProfile() {
    const age = document.getElementById('age').value; const gender = document.getElementById('gender').value;
    const weight = document.getElementById('weight').value; const height = document.getElementById('height').value; const goal = document.getElementById('goal').value;
    const custom_calories = document.getElementById('custom-calories').value; const custom_protein = document.getElementById('custom-protein').value;
    const custom_fat = document.getElementById('custom-fat').value; const custom_carbs = document.getElementById('custom-carbs').value;
    const custom_water_goal = document.getElementById('custom-water-goal').value;
    const food_preference = document.getElementById('food-preference').value;
    if (!age || !weight || !height) { tg.showAlert("Заполни все поля!"); return; }
    const oldWeight = currentProfileData ? parseFloat(currentProfileData.weight) : null; const newWeight = parseFloat(weight);
    if (oldWeight && oldWeight !== newWeight) saveWeightToHistory(newWeight);
    const profile = { age, gender, weight, height, goal, custom_calories, custom_protein, custom_fat, custom_carbs, custom_water_goal: parseInt(custom_water_goal) || 2000, food_preference };
    localStorage.setItem('cachedProfile', JSON.stringify(profile));
    await saveProgressToCloud(localStorage.getItem('tgId'), localStorage.getItem('currentEmail'), localStorage.getItem('userName'), profile, currentXP, totalBurnedCalories);
    renderProfile(profile); tg.showAlert("Данные сохранены!");
}

async function logout() {
    if (confirm("Выйти из аккаунта? Прогресс сохранен.")) { localStorage.clear(); await supabaseClient.auth.signOut(); location.reload(); }
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
        if (!isShakeTesting) return; const acc = event.accelerationIncludingGravity;
        if (acc) { const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0); if (Math.round(force) > maxShakeValue) maxShakeValue = Math.round(force); }
    });
    tg.showAlert("Тряси телефон!");
}
function stopShakeTest() {
    isShakeTesting = false; document.getElementById('test-shake-btn').style.display = 'block'; document.getElementById('stop-shake-btn').style.display = 'none';
    tg.showAlert("Максимум: " + maxShakeValue);
}

// --- СЕНСЕЙ (ИИ) ---
const OFOX_API_KEY = 'sk-of-QZJLAGlHceOaKnlXuLZlbWqJkufzujxgNbAJqxOvGguKzTHeyQdZXaAcPmKOuTmo';
let senseiChatHistory = [];
try {
    const savedHistory = localStorage.getItem('senseiChatHistory');
    if (savedHistory) {
        senseiChatHistory = JSON.parse(savedHistory);
    }
} catch(e) {
    console.error("Ошибка чтения истории чата", e);
}

function getSenseiContext() {
    let p = currentProfileData || { weight: 70, height: 175, goal: 'lose', age: 25, gender: 'male', food_preference: '' };
    let norm = calculateNutrition(p);
    let goalText = p.goal === 'lose' ? 'Похудеть' : 'Набрать массу';
    let waterGoal = p.custom_water_goal || 2000;
    let prefText = p.food_preference ? p.food_preference : 'Нет особых предпочтений';
    
    let todayWater = []; try { todayWater = JSON.parse(localStorage.getItem('todayWater') || '[]'); } catch(e){}
    let eatenWater = 0; todayWater.forEach(w => eatenWater += parseInt(w.amount || 0));
    
    let todayFood = []; try { todayFood = JSON.parse(localStorage.getItem('todayFood') || '[]'); } catch(e){}
    let eatenCal = 0, eatenProt = 0, eatenFat = 0, eatenCarb = 0;
    todayFood.forEach(f => {
        eatenCal += parseFloat(f.calories_100g || 0);
        eatenProt += parseFloat(f.proteins_100g || 0);
        eatenFat += parseFloat(f.fat_100g || 0);
        eatenCarb += parseFloat(f.carbs_100g || 0);
    });

    const now = new Date();
    const hour = now.getHours();
    let timeOfDay = hour < 12 ? "Утро (завтрак)" : hour < 18 ? "День (обед)" : "Вечер (ужин)";
    
    return `Ученик: Пол: ${p.gender === 'male' ? 'Мужской' : 'Женский'}, Возраст: ${p.age}, Вес: ${p.weight}кг, Рост: ${p.height}см. Цель: ${goalText}.
Время суток: ${timeOfDay}.
Предпочтения в еде: ${prefText}.
Норма на день: ${norm.calories} ккал, Белки: ${norm.protein}г, Жиры: ${norm.fat}г, Углеводы: ${norm.carbs}г. Вода: ${waterGoal} мл.
Уже съедено за сегодня: ${Math.round(eatenCal)} ккал, Белки: ${Math.round(eatenProt)}г, Жиры: ${Math.round(eatenFat)}г, Углеводы: ${Math.round(eatenCarb)}г. Вода: ${eatenWater} мл.`;
}

function openSenseiChat() {
    document.getElementById('sensei-chat-modal').classList.add('active');
    const chatBox = document.getElementById('sensei-chat-box');
    chatBox.innerHTML = ''; 
    
    if (senseiChatHistory.length === 0) {
        addSenseiMessage('assistant', 'Приветствую, воин! Я твой Сенсей. Вижу, ты ведешь дневник. Чем могу помочь? Спрашивай про тренировки, питание или мотивацию.');
    } else {
        senseiChatHistory.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = msg.role === 'user' ? 'sensei-msg user-msg' : 'sensei-msg bot-msg';
            msgDiv.innerText = msg.content;
            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function closeSenseiChat() {
    document.getElementById('sensei-chat-modal').classList.remove('active');
}

function addSenseiMessage(role, text) {
    const chatBox = document.getElementById('sensei-chat-box');
    if (!chatBox) return;

    if (senseiChatHistory.length > 0) {
        const lastMsg = senseiChatHistory[senseiChatHistory.length - 1];
        if (lastMsg.role === role && lastMsg.content === text) {
            return; 
        }
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = role === 'user' ? 'sensei-msg user-msg' : 'sensei-msg bot-msg';
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    senseiChatHistory.push({ role: role, content: text });
    if (senseiChatHistory.length > 100) {
        senseiChatHistory = senseiChatHistory.slice(senseiChatHistory.length - 100);
    }
    
    localStorage.setItem('senseiChatHistory', JSON.stringify(senseiChatHistory));
}

async function sendSenseiMessage() {
    const input = document.getElementById('sensei-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addSenseiMessage('user', text);
    
    const chatBox = document.getElementById('sensei-chat-box');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'sensei-msg bot-msg';
    loadingDiv.innerText = 'Анализирую...';
    loadingDiv.id = 'sensei-loading';
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const context = getSenseiContext();
        const systemPrompt = `Ты — Сенсей, суровый и мудрый наставник. Ты тренируешь воина.
ДАННЫЕ УЧЕНИКА:
${context}

ПРАВИЛА:
1. Пиши кратко, прямо, как военачальник. Без воды.
2. Если он косячит, укажи.
3. Если спрашивает план, предложи РАЗНООБРАЗНОЕ питание. Не предлагай курицу и гречку каждый раз.
4. Учитывай время суток.`;

        const contents = senseiChatHistory.slice(-10).map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        }

        const response = await fetch('https://api.ofox.ai/gemini/v1beta/models/google/gemini-2.5-flash-lite:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': OFOX_API_KEY
            },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();
        const loadEl = document.getElementById('sensei-loading');
        if (loadEl) loadEl.remove();

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            addSenseiMessage('assistant', data.candidates[0].content.parts[0].text);
        } else {
            let errorMsg = "Неизвестная ошибка.";
            if (data.error && data.error.message) errorMsg = data.error.message;
            addSenseiMessage('assistant', `Прости, воин. Ошибка API: ${errorMsg}`);
        }
    } catch (e) {
        const loadEl = document.getElementById('sensei-loading');
        if (loadEl) loadEl.remove();
        addSenseiMessage('assistant', 'Прости, воин. Ошибка сети. Попробуй позже.');
    }
}

async function showSenseiAdvice(customText = null) {
    const textEl = document.getElementById('sensei-advice-text');
    const modal = document.getElementById('sensei-advice-modal');
    if (!textEl || !modal) return;
    
    let advice = customText;
    
    if (!advice) {
        textEl.innerText = "Сенсей анализирует твой день...";
        modal.setAttribute('data-advice-text', 'Загрузка плана...');
        modal.classList.add('active');

        try {
            const context = getSenseiContext();
            const systemPrompt = `Ты — Сенсей. Составь УНИКАЛЬНЫЙ план на остаток дня.
ДАННЫЕ УЧЕНИКА:
${context}

Выдай ответ по шаблону:
🛑 ОШИБКИ: 
🍗 ПИТАНИЕ: 
💪 ТРЕНИРОВКА: `;

            const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];

            const response = await fetch('https://api.ofox.ai/gemini/v1beta/models/google/gemini-2.5-flash-lite:generateContent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': OFOX_API_KEY
                },
                body: JSON.stringify({ contents: contents })
            });

            const data = await response.json();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
                advice = data.candidates[0].content.parts[0].text;
            } else {
                throw new Error(data.error?.message || "Ошибка API");
            }
        } catch (e) {
            console.error(e);
            advice = `🛑 ОШИБКИ:\nСвязь с духами потеряна. Причина: ${e.message}\n\n🍗 ПИТАНИЕ:\nСъешь порцию рыбы (200г) и овощной салат.\n\n💪 ТРЕНИРОВКА:\n30 минут быстрой ходьбы.`;
        }
    }

    modal.setAttribute('data-advice-text', advice);
    textEl.innerText = advice;
}

function closeSenseiAdvice() {
    const modal = document.getElementById('sensei-advice-modal');
    if (modal) modal.classList.remove('active');
}

function openChatFromAdvice() {
    const modal = document.getElementById('sensei-advice-modal');
    const adviceText = modal.getAttribute('data-advice-text');
    
    closeSenseiAdvice();
    openSenseiChat();
    
    if (adviceText && adviceText !== 'Загрузка плана...') {
        addSenseiMessage('assistant', adviceText);
        setTimeout(() => {
            document.getElementById('sensei-input').focus();
        }, 300);
    }
}