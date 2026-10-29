const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

window.addEventListener('load', () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    }
});

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

function openProfileSettings() {
    document.getElementById('dashboard-screen').classList.remove('active');
    document.getElementById('profile-settings-screen').classList.add('active');
}

function closeScreen(screenId) {
    document.getElementById(screenId).classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');
}

function renderProfile(profile) {
    userGender = profile.gender;
    document.body.className = userGender === 'female' ? 'female-theme' : 'male-theme';
    
    let bmr = userGender === 'male' ? (10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5) : (10 * profile.weight + 6.25 * profile.height - 5 * profile.age - 161);
    let cals = profile.goal === 'lose' ? (bmr * 1.375 - 500) : (bmr * 1.375 + 500);
    document.getElementById('calories-norm').innerText = Math.round(cals) + " ккал";

    currentXP = parseInt(localStorage.getItem('cachedXP') || 0);
    totalBurnedCalories = parseInt(localStorage.getItem('cachedBurned') || 0);
    
    document.getElementById('burned-total').innerText = totalBurnedCalories + " ккал";
    updateCharacterUI();
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

    document.getElementById('char-level').innerText = "Уровень " + (newLevelIndex + 1);
    document.getElementById('char-title').innerText = currentLevel.title;

    let progressPercent = 100;
    if (nextLevel.xp > currentLevel.xp) {
        progressPercent = ((currentXP - currentLevel.xp) / (nextLevel.xp - currentLevel.xp)) * 100;
        document.getElementById('xp-text').innerText = currentXP + " / " + nextLevel.xp + " XP";
    } else {
        document.getElementById('xp-text').innerText = currentXP + " XP (MAX)";
    }
    document.getElementById('xp-bar').style.width = progressPercent + "%";
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
    closeScreen('profile-settings-screen');
}

function logout() {
    localStorage.clear();
    location.reload();
}
