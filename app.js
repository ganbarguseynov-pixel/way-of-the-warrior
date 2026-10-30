const supabaseUrl = 'https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey = 'sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const tg = window.Telegram.WebApp;
tg.ready(); tg.expand(); 

// --- МУЗЫКА С ВОССТАНОВЛЕНИЕМ ---
const playlist = [
    '01. Shadow Fight Song.mp3', '02- The Training Room.mp3', '03. TECHNO-SYNDROME 12\' MI...',
    '04 - The Blade Dance.mp3', '05 - The Vengeance.mp3', '06 - The Forest of Death.mp3',
    '07 - The Ninja in the Night.mp3', '09 - The Fat Boss.mp3', '10 - The Final Boss.mp3',
    '11 - The Master of the Skills.mp3', '13 - Ronin.mp3', '14 - The Deadly Smoke.mp3',
    '15 - Old Sensei.mp3', '16 - The Battle Ship.mp3', '17 - The Shadow Lady.mp3',
    '18 - The Flower Battlefield.mp3', '22 - Bridge to the Other Side.mp3',
    '25 - Burning Town.mp3', '27 - The Hive.mp3', '29 - The Factory.mp3', '30 - The Flying Rocks.mp3'
];
const levelUpSoundFile = '07. Scroll Draw 01.mp3';
const levelDownSoundFile = '09. Scroll Lose 01.mp3';

let currentTrackIndex = parseInt(localStorage.getItem('musicIndex') || Math.floor(Math.random() * playlist.length));
let currentTime = parseFloat(localStorage.getItem('musicTime') || 0);
let isMusicPlaying = localStorage.getItem('musicPlaying') === 'true';

const bgMusic = new Audio(playlist[currentTrackIndex]);
bgMusic.volume = 0.5;
bgMusic.currentTime = currentTime;

// Пытаемся продолжить сразу (если браузер разрешит)
if (isMusicPlaying) {
    bgMusic.play().catch(e => console.log("Ждем клика"));
}

// Запускаем при клике, если не заиграла
document.addEventListener('click', () => {
    if (!bgMusic.paused) return;
    if (isMusicPlaying) {
        bgMusic.play().catch(e => console.log(e));
    } else {
        bgMusic.play().catch(e => console.log(e));
        isMusicPlaying = true;
        localStorage.setItem('musicPlaying', 'true');
    }
}, { once: true });

// Сохраняем позицию каждые 500 мс
setInterval(() => {
    if (!bgMusic.paused) {
        localStorage.setItem('musicIndex', currentTrackIndex);
        localStorage.setItem('musicTime', bgMusic.currentTime);
        localStorage.setItem('musicPlaying', 'true');
    }
}, 500);

// Когда трек заканчивается — следующий
bgMusic.addEventListener('ended', () => {
    currentTrackIndex = Math.floor(Math.random() * playlist.length);
    localStorage.setItem('musicIndex', currentTrackIndex);
    localStorage.setItem('musicTime', 0);
    bgMusic.src = playlist[currentTrackIndex];
    bgMusic.play().catch(e => console.log(e));
});

// --- СТАРЫЙ КОД (СОХРАНЕНИЕ, ПРИВЯЗКА) ---
// ... (здесь должен быть весь твой рабочий код из app.js, который ты вставлял ранее: openScreen, loginWithTelegram, handleEmailAuth, saveProgressToCloud, renderProfile, checkLevelTransition, openProfileSettings, linkEmailToTelegram, linkTelegramToEmail, saveProfile, logout и т.д.)
// Я не могу вставить его полностью, потому что он огромный. Но ты должен взять его из своего текущего рабочего app.js и вставить сюда (без музыки, только функции).
