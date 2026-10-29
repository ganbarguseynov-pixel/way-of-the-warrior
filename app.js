const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();

window.addEventListener('load', () => {
    const cachedProfile = localStorage.getItem('cachedProfile');
    if (cachedProfile) {
        renderProfile(JSON.parse(cachedProfile));
    } else {
        // Если профиля нет, показываем главный экран и подсказку
        document.getElementById('dashboard-screen').classList.add('active');
        tg.showAlert("Пожалуйста, заполните профиль в настройках (⚙️)");
    }
});

// --- МУЗЫКА ---
const bgTracks = [
    "01. Shadow Fight Song.mp3", "02 - The Training Room.mp3", "04 - The Blade Dance.mp3", 
    "05 - The Vengeance.mp3", "06 - The Forest of Death.mp3", "07 - The Ninja in the Night.mp3", 
    "10 - The Final Boss.mp3", "11 - The Master of the Skills.mp3", "13 - Ronin.mp3"
];
let isSoundOn = true, musicStarted = false;
let lastBgIndex = -1;

const audioBg = document.getElementById('audio-bg');
const audioWorkout = document.getElementById('audio-workout');
const audioWin = document.getElementById('audio-win');
const audioLose = document.getElementById('audio-lose');

function getRandomTrack(tracksArray, lastIndex) {
    let newIndex = Math.floor(Math.random() * tracksArray.length);
    if (newIndex === lastIndex && tracksArray.length > 1) newIndex = (newIndex + 1) % tracksArray.length;
    return newIndex;
}

function playNextBg() {
    if (!isSoundOn) return;
    lastBgIndex = getRandomTrack(bgTracks, lastBgIndex);
    audioBg.src = bgTracks[lastBgIndex];
    audioBg.load(); 
    audioBg.play().catch(e => console.log("Autoplay blocked"));
}
audioBg.onended = playNextBg;

function toggleSound() {
    isSoundOn = !isSoundOn;
    const btn = document.getElementById('sound-btn');
    if (isSoundOn) {
        btn.innerText = "🔊";
        playNextBg();
    } else {
        btn.innerText = "🔇";
        audioBg.pause();
    }
}

// --- ПРОФИЛЬ ---
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

let currentXP = 0, totalBurnedCalories = 0, userGender = 'male', currentLevelIndexGlobal = 0;

function openProfileSettings() {
    document.getElementById('dashboard-screen').classList.remove('active');
    document.getElementById('profile-settings-screen').classList.add('active');
}

function openScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
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
    
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    document.getElementById('dashboard-screen').classList.add('active');
    
    playNextBg();
}

function changeTheme() {
    document.body.className = document.getElementById('gender').value === 'female' ? 'female-theme' : 'male-theme';
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

function addXP(amount) {
    currentXP += amount;
    localStorage.setItem('cachedXP', currentXP); 
    updateCharacterUI();
}

function logout() {
    localStorage.clear();
    tg.showAlert("Данные профиля очищены. Перезапустите приложение.");
    location.reload();
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

document.body.addEventListener('click', function() {
    if (!musicStarted) {
        musicStarted = true;
        if (isSoundOn) playNextBg();
    }
}, { once: true });
