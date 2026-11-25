const supabaseUrl='https://qnpriwfxzuoymoumdtrl.supabase.co';
const supabaseKey='sb_publishable_1jTWcnb3WvNMi79DXYU7Tw_RWKIVcsF';
const supabaseClient=supabase.createClient(supabaseUrl,supabaseKey);
const tg=window.Telegram.WebApp;
tg.ready();
tg.expand();

let chartWaterDiary=null,chartFoodCalDiary=null,chartFoodMacroDiary=null,chartWeightDiary=null,chartGlobalWeight=null,chartGlobalCal=null,chartGlobalMacro=null,chartGlobalWater=null;

function openScreen(id){document.querySelectorAll('.screen').forEach(function(e){e.classList.remove('active');});var t=document.getElementById(id);if(t)t.classList.add('active');}
function closeScreen(id){var el=document.getElementById(id);if(el)el.classList.remove('active');if(localStorage.getItem('cachedProfile')){var d=document.getElementById('dashboard-screen');if(d)d.classList.add('active');}else{var a=document.getElementById('auth-screen');if(a)a.classList.add('active');}}

function todayStr(){
  var d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function yesterdayStr(){
  var d=new Date();d.setDate(d.getDate()-1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function playerKey(){
  var t=localStorage.getItem('tgId');
  if(t)return 'tg:'+t;
  var e=localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail');
  if(e)return 'email:'+e.toLowerCase();
  return null;
}

async function resolveUserRecord(tgId,email){
  if(!tgId&&!email)return null;
  var map=new Map();
  if(tgId){
    var r1=await supabaseClient.from('user_links').select('*').eq('telegram_id',tgId);
    if(r1.data)r1.data.forEach(function(x){map.set(x.id,x);});
  }
  if(email){
    var r2=await supabaseClient.from('user_links').select('*').eq('email',email);
    if(r2.data)r2.data.forEach(function(x){map.set(x.id,x);});
  }
  var list=Array.from(map.values());
  var realTg=tgId,realEmail=email;
  list.forEach(function(x){
    if(x.telegram_id)realTg=x.telegram_id;
    if(x.email)realEmail=x.email;
  });
  if(realTg&&realTg!==tgId){
    var r3=await supabaseClient.from('user_links').select('*').eq('telegram_id',realTg);
    if(r3.data)r3.data.forEach(function(x){map.set(x.id,x);});
  }
  if(realEmail&&realEmail!==email){
    var r4=await supabaseClient.from('user_links').select('*').eq('email',realEmail);
    if(r4.data)r4.data.forEach(function(x){map.set(x.id,x);});
  }
  list=Array.from(map.values());
  if(list.length===0)return null;
  if(list.length===1){
    var one=list[0],patch={},need=false;
    if(!one.telegram_id&&realTg){patch.telegram_id=realTg;need=true;}
    if(!one.email&&realEmail){patch.email=realEmail;need=true;}
    if(need){
      await supabaseClient.from('user_links').update(patch).eq('id',one.id);
      Object.assign(one,patch);
    }
    return one;
  }
  var food=[],xp=0,burned=0,profile=null,name=null;
  list.forEach(function(x){
    if(x.food&&Array.isArray(x.food))food=food.concat(x.food);
    if(x.xp&&x.xp>xp)xp=x.xp;
    if(x.burned&&x.burned>burned)burned=x.burned;
    if(x.profile&&!profile)profile=x.profile;
    if(x.name&&!name)name=x.name;
  });
  var uniq=[],seen=new Set();
  food.forEach(function(f){
    var k=JSON.stringify(f);
    if(!seen.has(k)){seen.add(k);uniq.push(f);}
  });
  var first=list[0];
  var extraIds=list.slice(1).map(function(x){return x.id;});
  var merged={telegram_id:realTg||first.telegram_id||null,email:realEmail||first.email||null,food:uniq,xp:xp,burned:burned,profile:profile||first.profile,name:name||first.name||'Атлет'};
  await supabaseClient.from('user_links').update(merged).eq('id',first.id);
  if(extraIds.length>0)await supabaseClient.from('user_links').delete().in('id',extraIds);
  return Object.assign({},first,merged);
}

window.addEventListener('load',async function(){
  var p=localStorage.getItem('cachedProfile');
  if(p)renderProfile(JSON.parse(p));
  await syncFoodFromCloud();
});

async function loginWithTelegram(){
  if(!(tg.initDataUnsafe&&tg.initDataUnsafe.user)){tg.showAlert('Откройте через Telegram!');return;}
  localStorage.setItem('loginType','telegram');
  var id=tg.initDataUnsafe.user.id;
  var nm=tg.initDataUnsafe.user.first_name||'Атлет';
  localStorage.setItem('tgId',id);
  localStorage.setItem('userName',nm);
  var rec=await resolveUserRecord(id,null);
  if(rec&&rec.profile){
    localStorage.setItem('cachedProfile',JSON.stringify(rec.profile));
    localStorage.setItem('cachedXP',rec.xp||0);
    localStorage.setItem('cachedBurned',rec.burned||0);
    var td=todayStr();
    if(rec.profile.water&&rec.profile.waterDate===td){
      localStorage.setItem('todayWater',JSON.stringify(rec.profile.water));
      localStorage.setItem('waterListDate',td);
    }else{
      localStorage.setItem('todayWater','[]');
      localStorage.setItem('waterListDate',td);
    }
    if(rec.email){
      localStorage.setItem('linkedEmail',rec.email);
      localStorage.setItem('currentEmail',rec.email);
    }else{
      localStorage.removeItem('linkedEmail');
      localStorage.removeItem('currentEmail');
    }
    if(rec.name)localStorage.setItem('userName',rec.name);
    if(rec.food)localStorage.setItem('todayFood',JSON.stringify(rec.food));
  }else{
    var def={age:25,gender:'male',weight:70,height:175,goal:'lose',custom_water_goal:2000,food_preference:''};
    localStorage.setItem('cachedProfile',JSON.stringify(def));
    localStorage.setItem('cachedXP',0);
    localStorage.setItem('cachedBurned',0);
    await saveProgressToCloud(id,null,nm,def,0,0);
    openOnboardingModal();
  }
  renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
  await syncFoodFromCloud();
}

function showEmailForm(){openScreen('email-screen');}

async function handleEmailAuth(){
  var email=document.getElementById('auth-email').value;
  var pass=document.getElementById('auth-password').value;
  var btn=document.getElementById('email-submit-btn');
  if(!email||!pass){tg.showAlert('Заполните все поля!');return;}
  btn.innerText='Загрузка...';
  btn.disabled=true;
  try{
    var res=await supabaseClient.auth.signInWithPassword({email:email,password:pass});
    if(res.error){
      if(res.error.message.indexOf('Invalid login credentials')!==-1){
        var up=await supabaseClient.auth.signUp({email:email,password:pass});
        if(up.error){tg.showAlert('Ошибка регистрации: '+up.error.message);btn.innerText='Продолжить';btn.disabled=false;return;}
        if(up.data.user&&up.data.user.identities&&up.data.user.identities.length===0){
          tg.showAlert('Неверный пароль. Этот аккаунт уже существует.');
          btn.innerText='Продолжить';btn.disabled=false;return;
        }
        if(!up.data.session)await supabaseClient.auth.signInWithPassword({email:email,password:pass});
        tg.showAlert('Аккаунт успешно создан!');
      }else{
        tg.showAlert('Ошибка входа: '+res.error.message);
        btn.innerText='Продолжить';btn.disabled=false;return;
      }
    }else{
      tg.showAlert('Успешный вход!');
    }
    localStorage.setItem('loginType','email');
    localStorage.setItem('currentEmail',email);
    var nm=email.split('@')[0];
    localStorage.setItem('userName',nm);
    var rec=await resolveUserRecord(null,email);
    if(rec&&rec.profile){
      localStorage.setItem('cachedProfile',JSON.stringify(rec.profile));
      localStorage.setItem('cachedXP',rec.xp||0);
      localStorage.setItem('cachedBurned',rec.burned||0);
      var td=todayStr();
      if(rec.profile.water&&rec.profile.waterDate===td){
        localStorage.setItem('todayWater',JSON.stringify(rec.profile.water));
        localStorage.setItem('waterListDate',td);
      }else{
        localStorage.setItem('todayWater','[]');
        localStorage.setItem('waterListDate',td);
      }
      if(rec.telegram_id){
        localStorage.setItem('tgId',rec.telegram_id);
        localStorage.setItem('linkedEmail',email);
      }else{
        localStorage.removeItem('tgId');
      }
      if(rec.name)localStorage.setItem('userName',rec.name);
      if(rec.food)localStorage.setItem('todayFood',JSON.stringify(rec.food));
    }else{
      var def={age:25,gender:'male',weight:70,height:175,goal:'lose',custom_water_goal:2000,food_preference:''};
      localStorage.setItem('cachedProfile',JSON.stringify(def));
      localStorage.setItem('cachedXP',0);
      localStorage.setItem('cachedBurned',0);
      await saveProgressToCloud(null,email,nm,def,0,0);
      openOnboardingModal();
    }
    renderProfile(JSON.parse(localStorage.getItem('cachedProfile')));
    await syncFoodFromCloud();
  }catch(e){
    tg.showAlert('Ошибка сети.');
  }finally{
    btn.innerText='Продолжить';
    btn.disabled=false;
  }
}

function openOnboardingModal(){
  setTimeout(function(){
    var m=document.getElementById('onboarding-modal');
    if(m)m.classList.add('active');
  },500);
}

async function saveOnboardingData(){
  var age=document.getElementById('onboarding-age').value;
  var weight=document.getElementById('onboarding-weight').value;
  var height=document.getElementById('onboarding-height').value;
  var gender=document.getElementById('onboarding-gender').value;
  var goal=document.getElementById('onboarding-goal').value;
  var pref=document.getElementById('onboarding-food-preference').value;
  if(!age||!weight||!height){tg.showAlert('Пожалуйста, заполни возраст, вес и рост!');return;}
  var water=weight?Math.round(parseFloat(weight)*30):2000;
  var prof={age:age,gender:gender,weight:weight,height:height,goal:goal,custom_calories:'',custom_protein:'',custom_fat:'',custom_carbs:'',custom_water_goal:water,food_preference:pref};
  localStorage.setItem('cachedProfile',JSON.stringify(prof));
  var t=localStorage.getItem('tgId');
  var e=localStorage.getItem('currentEmail')||localStorage.getItem('linkedEmail');
  var n=localStorage.getItem('userName')||'Атлет';
  await saveProgressToCloud(t,e,n,prof,0,0);
  var m=document.getElementById('onboarding-modal');
  if(m)m.classList.remove('active');
  renderProfile(prof);
  tg.showAlert('Отлично! Твоя норма воды рассчитана автоматически.');
}

async function syncFoodFromCloud(){
  var t=localStorage.getItem('tgId');
  var e=localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail');
  if(!t&&!e)return;
  var rec=await resolveUserRecord(t,e);
  var local=[];
  try{local=JSON.parse(localStorage.getItem('todayFood')||'[]');}catch(err){local=[];}
  var td=todayStr();
  var dateKey=localStorage.getItem('foodListDate');
  if(!rec)return;
  var cloud=rec.food||[];
  if(dateKey&&dateKey===td){
    if(cloud.length>0)localStorage.setItem('todayFood',JSON.stringify(cloud));
    else if(local.length>0)await supabaseClient.from('user_links').update({food:local}).eq('id',rec.id);
  }else if(dateKey){
    archiveFoodToHistory(local,dateKey);
    localStorage.setItem('todayFood','[]');
    localStorage.setItem('foodListDate',td);
    await supabaseClient.from('user_links').update({food:[]}).eq('id',rec.id);
  }else{
    if(cloud.length>0)localStorage.setItem('todayFood',JSON.stringify(cloud));
    else if(local.length>0)await supabaseClient.from('user_links').update({food:local}).eq('id',rec.id);
    localStorage.setItem('foodListDate',td);
  }
  updateDashboard();
}

async function saveFoodToCloud(food){
  var t=localStorage.getItem('tgId');
  var e=localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail');
  if(!t&&!e)return;
  var rec=await resolveUserRecord(t,e);
  if(rec)await supabaseClient.from('user_links').update({food:food}).eq('id',rec.id);
}

async function syncWaterToProfile(){
  var w=[];
  try{w=JSON.parse(localStorage.getItem('todayWater')||'[]');}catch(err){w=[];}
  var key=localStorage.getItem('waterListDate');
  var prof=JSON.parse(localStorage.getItem('cachedProfile')||'{}');
  prof.water=w;
  prof.waterDate=key;
  localStorage.setItem('cachedProfile',JSON.stringify(prof));
  await saveProgressToCloud(localStorage.getItem('tgId'),localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail'),localStorage.getItem('userName')||'Атлет',prof,currentXP,totalBurnedCalories);
}

async function saveProgressToCloud(tgId,email,name,profile,xp,burned){
  try{
    var t=tgId||localStorage.getItem('tgId');
    var e=email||localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail');
    var n=name||localStorage.getItem('userName')||'Атлет';
    if(!t&&!e)return;
    var rec=await resolveUserRecord(t,e);
    if(rec){
      await supabaseClient.from('user_links').update({profile:profile,burned:burned,name:n,telegram_id:t||null,email:e||null}).eq('id',rec.id);
    }else{
      await supabaseClient.from('user_links').insert([{telegram_id:t,email:e,profile:profile,xp:xp,burned:burned,name:n}]);
    }
  }catch(err){
    console.log('Ошибка сохранения:',err);
  }
}

const levelsData={
  male:[
    {xp:0,title:'Странник',video:'VID_20261028_173134_198.mp4'},
    {xp:100,title:'Берсерк',video:'VID_20261028_173215_440.mp4'},
    {xp:250,title:'Мечник',video:'VID_20261028_162626_544.mp4'},
    {xp:450,title:'Ветеран',video:'VID_20261028_173219_295.mp4'},
    {xp:700,title:'Гладиатор',video:'VID_20261028_173227_311.mp4'},
    {xp:1000,title:'Чемпион',video:'VID_20261028_173233_432.mp4'},
    {xp:1400,title:'Мастер клинка',video:'VID_20261028_173238_313.mp4'},
    {xp:1900,title:'Воевода',video:'VID_20261028_173251_027.mp4'},
    {xp:2500,title:'Легенда',video:'VID_20261028_173803_138.mp4'},
    {xp:3500,title:'Бессмертный',video:'VID_20261028_173808_318.mp4'}
  ],
  female:[
    {xp:0,title:'Новичок',video:'VID_20261028_175618_746.mp4'},
    {xp:100,title:'Фурия',video:'VID_20261028_175631_701.mp4'},
    {xp:250,title:'Амазонка',video:'VID_20261028_175641_349.mp4'},
    {xp:450,title:'Валькирия',video:'VID_20261028_175649_029.mp4'},
    {xp:700,title:'Воительница',video:'VID_20261028_175659_208.mp4'},
    {xp:1000,title:'Победительница',video:'VID_20261028_175708_920.mp4'},
    {xp:1400,title:'Королева клинка',video:'VID_20261028_175726_660.mp4'},
    {xp:1900,title:'Владычица',video:'VID_20261028_175732_350.mp4'},
    {xp:2500,title:'Легенда',video:'VID_20261028_175744_681.mp4'},
    {xp:3500,title:'Бессмертная',video:'VID_20261028_175750_651.mp4'}
  ]
};

let currentXP=0,totalBurnedCalories=0,userGender='male',currentProfileData=null,currentLevelIndex=-1;

const EXTRA_PROFILE_KEYS=['customExercises','workoutLists','workoutSessions'];

function keepExtras(prof){
  if(!prof||!currentProfileData||prof===currentProfileData)return prof;
  EXTRA_PROFILE_KEYS.forEach(function(k){
    if(prof[k]===undefined&&currentProfileData[k]!==undefined)prof[k]=currentProfileData[k];
  });
  return prof;
}

var extrasSaveTimer=null;
function flushProfileSave(){
  if(!extrasSaveTimer)return;
  clearTimeout(extrasSaveTimer);
  extrasSaveTimer=null;
  if(!currentProfileData)return;
  localStorage.setItem('cachedProfile',JSON.stringify(currentProfileData));
  saveProgressToCloud(localStorage.getItem('tgId'),localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail'),localStorage.getItem('userName'),currentProfileData,currentXP,totalBurnedCalories);
}
window.addEventListener('srx:profile-changed',function(){
  clearTimeout(extrasSaveTimer);
  extrasSaveTimer=setTimeout(flushProfileSave,800);
});
window.addEventListener('pagehide',flushProfileSave);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden')flushProfileSave();
});

function calculateNutrition(p){
  if(p.custom_calories&&p.custom_calories>0){
    return {calories:parseInt(p.custom_calories),protein:parseInt(p.custom_protein)||0,fat:parseInt(p.custom_fat)||0,carbs:parseInt(p.custom_carbs)||0};
  }
  var w=parseFloat(p.weight)||70;
  var h=parseFloat(p.height)||175;
  var a=parseInt(p.age)||25;
  var bmr=p.gender==='male'?(10*w+6.25*h-5*a+5):(10*w+6.25*h-5*a-161);
  var cal=bmr*1.375;
  if(p.goal==='lose')cal-=500;
  if(p.goal==='gain')cal+=500;
  return {calories:Math.round(cal),protein:Math.round(cal*0.3/4),fat:Math.round(cal*0.3/9),carbs:Math.round(cal*0.4/4)};
}

function checkDayReset(){
  var td=todayStr();
  if(localStorage.getItem('foodListDate')!==td){
    localStorage.setItem('todayFood','[]');
    localStorage.setItem('foodListDate',td);
  }
  if(localStorage.getItem('waterListDate')!==td){
    localStorage.setItem('todayWater','[]');
    localStorage.setItem('waterListDate',td);
  }
}

function saveWeightToHistory(w){
  var list=[];
  try{list=JSON.parse(localStorage.getItem('weightHistory')||'[]');}catch(err){list=[];}
  var d=new Date();
  var raw=todayStr();
  if(list.length>0&&list[0].dateRaw===raw){
    list[0].weight=parseFloat(w);
  }else{
    list.unshift({dateRaw:raw,dateDisplay:d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}),weight:parseFloat(w)});
  }
  if(list.length>50)list.pop();
  localStorage.setItem('weightHistory',JSON.stringify(list));
}

/* ===== СЕРИЯ: одна, из базы (challenge_streak) ===== */
function streakFromRecord(rec){
  if(!rec)return {streak:0,doneToday:false};
  var last=rec.challenge_last_date||null;
  var streak=parseInt(rec.challenge_streak||0);
  var today=todayStr();
  var yest=yesterdayStr();
  if(last!==today&&last!==yest)streak=0;
  return {streak:streak,doneToday:last===today};
}

function updateStreakUI(streak,isPending){
  var el=document.getElementById('streak-display');
  if(!el)return;
  el.innerText='🔥 '+streak;
  if(isPending)el.classList.add('streak-pending');
  else el.classList.remove('streak-pending');
}

async function refreshUserFromCloud(){
  var rec=await resolveUserRecord(localStorage.getItem('tgId'),localStorage.getItem('linkedEmail')||localStorage.getItem('currentEmail'));
  if(!rec)return;
  var xp=parseInt(rec.xp||0);
  if(!isNaN(xp)){
    currentXP=xp;
    localStorage.setItem('cachedXP',String(xp));
  }
  if(rec.burned!==null&&rec.burned!==undefined){
    totalBurnedCalories=parseInt(rec.burned||0);
    localStorage.setItem('cachedBurned',String(totalBurnedCalories));
    var bt=document.getElementById('burned-total');
    if(bt)bt.innerText=totalBurnedCalories+' ккал';
  }
  if(rec.name)localStorage.setItem('userName',rec.name);
  var st=streakFromRecord(rec);
  updateStreakUI(st.streak,!st.doneToday);
  updateCharacterUI();
}

async function claimStreakReward(){
  await refreshUserFromCloud();
  var el=document.getElementById('streak-display');
  var shown=el?el.innerText.replace('🔥','').trim():'0';
  showMotivationToast('🔥 Твоя серия: '+shown+' дн.','Отметь челлендж дня, чтобы получить награду XP.','🔥');
}
/* ================================================== */

function openWeightDiary(){
  if(currentProfileData){
    var i=document.getElementById('modal-weight-input');
    if(i)i.value=currentProfileData.weight||'';
  }
  setPeriod('weight','7days');
  openScreen('weight-diary-screen');
}

async function saveWeightFromDiary(){
  var w=parseFloat(document.getElementById('modal-weight-input').value);
  if(!w||w<=0){tg.showAlert('Введите корректный вес!');return;}
  if(!currentProfileData)return;
  currentProfileData.weight=w;
  localStorage.setItem('cachedProfile',JSON.stringify(currentProfileData));
  saveWeightToHistory(w);
  await saveProgressToCloud(localStorage.getItem('tgId'),localStorage.getItem('currentEmail'),localStorage.getItem('userName'),currentProfileData,currentXP,totalBurnedCalories);
  updateDashboard();
  renderWeightDiary();
  tg.showAlert('Вес обновлен!');
}

function renderWeightDiary(){
  var from=document.getElementById('weight-start-date').value;
  var to=document.getElementById('weight-end-date').value;
  if(!from||!to)return;
  var hist=[];
  try{hist=JSON.parse(localStorage.getItem('weightHistory')||'[]');}catch(err){hist=[];}
  var labels=[],data=[];
  for(var d=new Date(from);d<=new Date(to);d.setDate(d.getDate()+1)){
    var key=d.toISOString().split('T')[0];
    labels.push(key.split('-').slice(1).reverse().join('.'));
    var found=hist.find(function(x){return x.dateRaw===key||(x.date&&x.date.split('.').reverse().join('-')===key);});
    if(found)data.push(found.weight);
    else{
      var last=data.filter(function(v){return v!==null;}).pop();
      data.push(last||null);
    }
  }
  if(chartWeightDiary)chartWeightDiary.destroy();
  chartWeightDiary=new Chart(document.getElementById('weight-diary-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Вес',data:data,borderColor:'#ffcc00',backgroundColor:'#ffcc0033',borderWidth:2,pointBackgroundColor:'#fff',pointBorderColor:'#ffcc00',pointRadius:3,fill:true,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}},y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}}}}
  });
  var vals=data.filter(function(v){return v!==null;});
  var diffEl=document.getElementById('weight-diff');
  var sumEl=document.getElementById('weight-summary');
  if(vals.length>1){
    sumEl.style.display='block';
    var diff=(vals[vals.length-1]-vals[0]).toFixed(1);
    if(diff>0)diffEl.innerHTML='Набрано: <span style="color: #ff3b30;">+'+diff+' кг</span>';
    else if(diff<0)diffEl.innerHTML='Сброшено: <span style="color: #34c759;">'+diff+' кг</span>';
    else diffEl.innerHTML='Вес не изменился';
  }else{
    sumEl.style.display='none';
  }
  var html='';
  hist.filter(function(x){return x.dateRaw>=from&&x.dateRaw<=to;}).forEach(function(x){
    html+='<div class="history-weight-item"><span style="color: var(--accent-color);">'+(x.dateDisplay||x.date)+'</span><span>'+x.weight+' кг</span></div>';
  });
  document.getElementById('weight-diary-list').innerHTML=html||'<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function updateCustomWaterBtn(){
  var b=document.getElementById('custom-water-quick-btn');
  if(!b)return;
  var v=localStorage.getItem('customWaterAmount');
  if(v&&parseInt(v)>0)b.innerText='+'+v;
  else b.innerText='+Своя';
}

function quickAddCustomWater(){
  var v=localStorage.getItem('customWaterAmount');
  if(v&&parseInt(v)>0)addWater(v);
  else openWaterDiary();
}

function showMotivationToast(title,desc,icon){
  if(!icon)icon='🏆';
  var toast=document.createElement('div');
  toast.className='motivation-toast';
  toast.innerHTML='<div class="motivation-icon">'+icon+'</div><div class="motivation-text"><h3>'+title+'</h3><p>'+desc+'</p></div>';
  document.body.appendChild(toast);
  setTimeout(function(){toast.classList.add('show');},100);
  setTimeout(function(){
    toast.classList.remove('show');
    setTimeout(function(){toast.remove();},500);
  },4000);
}

function addWater(amount){
  var list=[];
  try{list=JSON.parse(localStorage.getItem('todayWater')||'[]');}catch(err){list=[];}
  list.push({amount:parseInt(amount),time:new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})});
  localStorage.setItem('todayWater',JSON.stringify(list));
  var total=0;
  list.forEach(function(w){total+=parseInt(w.amount);});
  var norm=currentProfileData?(currentProfileData.custom_water_goal||2000):2000;
  var prev=total-parseInt(amount);
  if(prev<norm&&total>=norm){
    showMotivationToast('Вода в норме! 💧','Ты выпил свою дневную норму. Отличная работа, воин!','💧');
  }
  syncWaterToProfile();
  updateDashboard();
  archiveWaterToHistory(list,localStorage.getItem('waterListDate'));
}

function deleteWaterItem(i){
  var list=[];
  try{list=JSON.parse(localStorage.getItem('todayWater')||'[]');}catch(err){list=[];}
  list.splice(i,1);
  localStorage.setItem('todayWater',JSON.stringify(list));
  syncWaterToProfile();
  updateDashboard();
  archiveWaterToHistory(list,localStorage.getItem('waterListDate'));
  renderTodayWaterList(list);
}

function openWaterDiary(){
  setPeriod('water','7days');
  var list=[];
  try{list=JSON.parse(localStorage.getItem('todayWater')||'[]');}catch(err){list=[];}
  renderTodayWaterList(list);
  openScreen('water-diary-screen');
}

function addWaterFromDiary(){
  var v=parseInt(document.getElementById('custom-water-input').value);
  if(v&&v>0){
    localStorage.setItem('customWaterAmount',v);
    updateCustomWaterBtn();
    addWater(v);
    document.getElementById('custom-water-input').value='';
  }else{
    tg.showAlert('Введите корректный объем!');
  }
}

function renderWaterDiary(){
  var from=document.getElementById('water-start-date').value;
  var to=document.getElementById('water-end-date').value;
  if(!from||!to)return;
  var hist={};
  try{hist=JSON.parse(localStorage.getItem('waterHistory')||'{}');}catch(err){hist={};}
  var labels=[],data=[],total=0;
  for(var d=new Date(from);d<=new Date(to);d.setDate(d.getDate()+1)){
    var key=d.toISOString().split('T')[0];
    labels.push(key.split('-').slice(1).reverse().join('.'));
    var sum=0;
    (hist[key]||[]).forEach(function(w){sum+=parseInt(w.amount||0);});
    data.push(sum);
    total+=sum;
  }
  if(chartWaterDiary)chartWaterDiary.destroy();
  chartWaterDiary=new Chart(document.getElementById('water-diary-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Вода',data:data,borderColor:'#5ac8fa',backgroundColor:'#5ac8fa33',borderWidth:2,pointBackgroundColor:'#fff',pointBorderColor:'#5ac8fa',pointRadius:3,fill:true,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}},y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
  document.getElementById('water-summary').style.display='block';
  document.getElementById('water-total-ml').innerText=total;
  var html='';
  Object.keys(hist).filter(function(k){return k>=from&&k<=to;}).sort(function(a,b){return new Date(b)-new Date(a);}).forEach(function(k){
    var items=hist[k]||[];
    if(items.length===0)return;
    var s=0;
    items.forEach(function(x){s+=parseInt(x.amount);});
    html+='<div class="history-card"><div class="history-date">📅 '+k.split('-').reverse().join('.')+' <span style="float:right; font-size: 12px; color:#5ac8fa;">'+s+' мл</span></div>';
    items.forEach(function(x){
      html+='<div class="history-water-item"><span>💧 Вода</span><span style="color:#8e8e93;">'+x.amount+' мл ('+(x.time||'')+')</span></div>';
    });
    html+='</div>';
  });
  document.getElementById('water-diary-list').innerHTML=html||'<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function openFoodDiary(){
  setPeriod('food','7days');
  openScreen('food-diary-screen');
}

function renderFoodDiary(){
  var from=document.getElementById('food-start-date').value;
  var to=document.getElementById('food-end-date').value;
  if(!from||!to)return;
  var hist={};
  try{hist=JSON.parse(localStorage.getItem('foodHistory')||'{}');}catch(err){hist={};}
  var labels=[],cal=[],prot=[],fat=[],carb=[];
  var tCal=0,tProt=0,tFat=0,tCarb=0;
  for(var d=new Date(from);d<=new Date(to);d.setDate(d.getDate()+1)){
    var key=d.toISOString().split('T')[0];
    labels.push(key.split('-').slice(1).reverse().join('.'));
    var items=hist[key]||[];
    var c=0,pr=0,f=0,cb=0;
    items.forEach(function(x){
      c+=parseFloat(x.calories_100g||0);
      pr+=parseFloat(x.proteins_100g||0);
      f+=parseFloat(x.fat_100g||0);
      cb+=parseFloat(x.carbs_100g||0);
    });
    cal.push(Math.round(c));
    prot.push(Math.round(pr));
    fat.push(Math.round(f));
    carb.push(Math.round(cb));
    tCal+=c;tProt+=pr;tFat+=f;tCarb+=cb;
  }
  if(chartFoodCalDiary)chartFoodCalDiary.destroy();
  chartFoodCalDiary=new Chart(document.getElementById('food-diary-cal-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Калории',data:cal,borderColor:'#ff3b30',backgroundColor:'#ff3b3033',borderWidth:2,pointRadius:3,fill:true,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Калории',color:'#fff'}},scales:{x:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}},y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
  if(chartFoodMacroDiary)chartFoodMacroDiary.destroy();
  chartFoodMacroDiary=new Chart(document.getElementById('food-diary-macro-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[
      {label:'Белки',data:prot,borderColor:'#34c759',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
      {label:'Жиры',data:fat,borderColor:'#ff9500',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
      {label:'Углеводы',data:carb,borderColor:'#af52de',borderWidth:2,pointRadius:2,fill:false,tension:0.3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#fff'}},title:{display:true,text:'БЖУ',color:'#fff'}},scales:{x:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}},y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
  document.getElementById('food-summary').style.display='block';
  document.getElementById('food-total-cal').innerText=Math.round(tCal);
  document.getElementById('food-total-prot').innerText=Math.round(tProt);
  document.getElementById('food-total-fat').innerText=Math.round(tFat);
  document.getElementById('food-total-carb').innerText=Math.round(tCarb);
  var html='';
  Object.keys(hist).filter(function(k){return k>=from&&k<=to;}).sort(function(a,b){return new Date(b)-new Date(a);}).forEach(function(k){
    var items=hist[k]||[];
    if(items.length===0)return;
    var c=0,pr=0,f=0,cb=0;
    items.forEach(function(x){
      c+=parseFloat(x.calories_100g||0);
      pr+=parseFloat(x.proteins_100g||0);
      f+=parseFloat(x.fat_100g||0);
      cb+=parseFloat(x.carbs_100g||0);
    });
    html+='<div class="history-card"><div class="history-date">📅 '+k.split('-').reverse().join('.')+'</div>';
    html+='<div class="summary-grid">';
    html+='<div><span style="color: var(--accent-color); font-weight: bold;">'+Math.round(c)+'</span><br><span style="font-size: 10px; color: #8e8e93;">Ккал</span></div>';
    html+='<div><span style="color: #fff; font-weight: bold;">'+Math.round(pr)+'</span><br><span style="font-size: 10px; color: #8e8e93;">Бел.</span></div>';
    html+='<div><span style="color: #fff; font-weight: bold;">'+Math.round(f)+'</span><br><span style="font-size: 10px; color: #8e8e93;">Жир.</span></div>';
    html+='<div><span style="color: #fff; font-weight: bold;">'+Math.round(cb)+'</span><br><span style="font-size: 10px; color: #8e8e93;">Угл.</span></div>';
    html+='</div>';
    items.forEach(function(x){
      html+='<div class="history-food-item"><span>'+x.product_name+'</span><span style="color: #8e8e93;">'+Math.round(x.calories_100g||0)+' ккал</span></div>';
    });
    html+='</div>';
  });
  document.getElementById('food-diary-list').innerHTML=html||'<p style="text-align: center; color: #8e8e93;">Нет записей за этот период.</p>';
}

function openGlobalStatsModal(){
  var to=new Date();
  var from=new Date();
  from.setDate(to.getDate()-7);
  document.getElementById('global-start-date').value=from.toISOString().split('T')[0];
  document.getElementById('global-end-date').value=to.toISOString().split('T')[0];
  openScreen('global-stats-screen');
  setTimeout(function(){renderAllCharts();},100);
}

function renderAllCharts(){
  if(typeof Chart==='undefined')return;
  var from=document.getElementById('global-start-date').value;
  var to=document.getElementById('global-end-date').value;
  if(!from||!to)return;
  var foodHist={},waterHist={},weights=[];
  try{foodHist=JSON.parse(localStorage.getItem('foodHistory')||'{}');}catch(err){foodHist={};}
  try{waterHist=JSON.parse(localStorage.getItem('waterHistory')||'{}');}catch(err){waterHist={};}
  try{weights=JSON.parse(localStorage.getItem('weightHistory')||'[]');}catch(err){weights=[];}
  var labels=[],wData=[],cal=[],prot=[],fat=[],carb=[],water=[];
  for(var d=new Date(from);d<=new Date(to);d.setDate(d.getDate()+1)){
    var key=d.toISOString().split('T')[0];
    labels.push(key.split('-').slice(1).reverse().join('.'));
    var wf=weights.find(function(x){return x.dateRaw===key||(x.date&&x.date.split('.').reverse().join('-')===key);});
    if(wf)wData.push(wf.weight);
    else{
      var last=wData.filter(function(v){return v!==null;}).pop();
      wData.push(last||null);
    }
    var c=0,pr=0,f=0,cb=0;
    (foodHist[key]||[]).forEach(function(x){
      c+=parseFloat(x.calories_100g||0);
      pr+=parseFloat(x.proteins_100g||0);
      f+=parseFloat(x.fat_100g||0);
      cb+=parseFloat(x.carbs_100g||0);
    });
    cal.push(Math.round(c));
    prot.push(Math.round(pr));
    fat.push(Math.round(f));
    carb.push(Math.round(cb));
    var wSum=0;
    (waterHist[key]||[]).forEach(function(x){wSum+=parseInt(x.amount||0);});
    water.push(wSum);
  }
  var base={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}},y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'}}}};
  if(chartGlobalWeight)chartGlobalWeight.destroy();
  chartGlobalWeight=new Chart(document.getElementById('g-weight-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Вес',data:wData,borderColor:'#ffcc00',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]},
    options:Object.assign({},base,{plugins:{legend:{display:false},title:{display:true,text:'Вес (кг)',color:'#fff'}}})
  });
  if(chartGlobalCal)chartGlobalCal.destroy();
  chartGlobalCal=new Chart(document.getElementById('g-calories-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Калории',data:cal,borderColor:'#ff3b30',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Калории (ккал)',color:'#fff'}},scales:{x:base.scales.x,y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
  if(chartGlobalMacro)chartGlobalMacro.destroy();
  chartGlobalMacro=new Chart(document.getElementById('g-macros-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[
      {label:'Белки',data:prot,borderColor:'#34c759',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
      {label:'Жиры',data:fat,borderColor:'#ff9500',borderWidth:2,pointRadius:2,fill:false,tension:0.3},
      {label:'Углеводы',data:carb,borderColor:'#af52de',borderWidth:2,pointRadius:2,fill:false,tension:0.3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#fff'}},title:{display:true,text:'БЖУ (граммы)',color:'#fff'}},scales:{x:base.scales.x,y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
  if(chartGlobalWater)chartGlobalWater.destroy();
  chartGlobalWater=new Chart(document.getElementById('g-water-chart').getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{label:'Вода',data:water,borderColor:'#5ac8fa',borderWidth:2,pointRadius:2,fill:false,tension:0.3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:'Вода (мл)',color:'#fff'}},scales:{x:base.scales.x,y:{ticks:{color:'#8e8e93'},grid:{color:'rgba(255,255,255,0.1)'},beginAtZero:true}}}
  });
}

function setPeriod(kind,range){
  var s=document.getElementById(kind+'-start-date');
  var e=document.getElementById(kind+'-end-date');
  var now=new Date();
  e.value=now.toISOString().split('T')[0];
  if(range==='7days'){
    var a=new Date(now);a.setDate(now.getDate()-7);s.value=a.toISOString().split('T')[0];
  }else if(range==='30days'){
    var b=new Date(now);b.setDate(now.getDate()-30);s.value=b.toISOString().split('T')[0];
  }else if(range==='month'){
    var c=new Date(now.getFullYear(),now.getMonth(),1);s.value=c.toISOString().split('T')[0];
  }
  if(kind==='water')renderWaterDiary();
  if(kind==='food')renderFoodDiary();
  if(kind==='weight')renderWeightDiary();
}

function archiveFoodToHistory(items,dateKey){
  if(!items||items.length===0||!dateKey)return;
  var hist={};
  try{hist=JSON.parse(localStorage.getItem('foodHistory')||'{}');}catch(err){hist={};}
  hist[dateKey]=items;
  localStorage.setItem('foodHistory',JSON.stringify(hist));
}

function archiveWaterToHistory(items,dateKey){
  if(!items||items.length===0||!dateKey)return;
  var hist={};
  try{hist=JSON.parse(localStorage.getItem('waterHistory')||'{}');}catch(err){hist={};}
  hist[dateKey]=items;
  localStorage.setItem('waterHistory',JSON.stringify(hist));
}

function updateDashboard(){
  if(!currentProfileData)return;
  checkDayReset();
  var wd=document.getElementById('current-weight-display');
  if(wd)wd.innerText=currentProfileData.weight||0;
  updateCustomWaterBtn();
  var norm=calculateNutrition(currentProfileData);
  var food=[];
  try{food=JSON.parse(localStorage.getItem('todayFood')||'[]');}catch(err){food=[];}
  var fd=localStorage.getItem('foodListDate');
  if(fd&&food.length>0)archiveFoodToHistory(food,fd);
  var c=0,pr=0,f=0,cb=0;
  food.forEach(function(x){
    c+=parseFloat(x.calories_100g||0);
    pr+=parseFloat(x.proteins_100g||0);
    f+=parseFloat(x.fat_100g||0);
    cb+=parseFloat(x.carbs_100g||0);
  });
  if(document.getElementById('norm-cal')){
    document.getElementById('norm-cal').innerText=norm.calories;
    document.getElementById('norm-prot').innerText=norm.protein;
    document.getElementById('norm-fat').innerText=norm.fat;
    document.getElementById('norm-carb').innerText=norm.carbs;
  }
  var setVal=function(id,val,limit){
    var el=document.getElementById(id);
    if(!el)return;
    el.innerText=Math.round(val);
    el.style.color=val>limit?'#ff3b30':'#fff';
  };
  setVal('eaten-cal',c,norm.calories);
  setVal('eaten-prot',pr,norm.protein);
  setVal('eaten-fat',f,norm.fat);
  setVal('eaten-carb',cb,norm.carbs);
  if(document.getElementById('calories-norm'))document.getElementById('calories-norm').innerText=norm.calories+' ккал';
  renderTodayFoodList(food);
  var water=[];
  try{water=JSON.parse(localStorage.getItem('todayWater')||'[]');}catch(err){water=[];}
  var wdate=localStorage.getItem('waterListDate');
  if(wdate&&water.length>0)archiveWaterToHistory(water,wdate);
  var wsum=0;
  water.forEach(function(x){wsum+=parseInt(x.amount||0);});
  var wnorm=currentProfileData.custom_water_goal||2000;
  if(document.getElementById('eaten-water'))document.getElementById('eaten-water').innerText=wsum;
  if(document.getElementById('norm-water'))document.getElementById('norm-water').innerText=wnorm;
  renderTodayWaterList(water);
}

function renderTodayFoodList(items){
  var box=document.getElementById('today-food-list');
  if(!box)return;
  if(items.length===0){
    box.innerHTML='<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не съедено</p>';
    return;
  }
  var html='';
  items.forEach(function(x,i){
    html+='<div class="compact-food-item"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 85%;">'+x.product_name+'</div><button onclick="event.stopPropagation(); deleteFoodItem('+i+')" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>';
  });
  box.innerHTML=html;
}

function renderTodayWaterList(items){
  var box=document.getElementById('today-water-list');
  if(!box)return;
  if(items.length===0){
    box.innerHTML='<p style="text-align: center; color: #8e8e93; font-size: 10px;">Пока ничего не выпито</p>';
    return;
  }
  var html='';
  items.forEach(function(x,i){
    html+='<div class="compact-food-item" style="border-left: 2px solid #5ac8fa;"><div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">💧 '+x.amount+' мл ('+x.time+')</div><button onclick="event.stopPropagation(); deleteWaterItem('+i+')" style="background: none; border: none; color: #ff3b30; font-size: 14px; cursor: pointer; padding: 0;">✖</button></div>';
  });
  box.innerHTML=html;
}

function deleteFoodItem(i){
  var food=[];
  try{food=JSON.parse(localStorage.getItem('todayFood')||'[]');}catch(err){food=[];}
  food.splice(i,1);
  localStorage.setItem('todayFood',JSON.stringify(food));
  saveFoodToCloud(food);
  updateDashboard();
}

function openCustomNormModal(){
  if(!currentProfileData)return;
  document.getElementById('modal-calories').value=currentProfileData.custom_calories||'';
  document.getElementById('modal-protein').value=currentProfileData.custom_protein||'';
  document.getElementById('modal-fat').value=currentProfileData.custom_fat||'';
  document.getElementById('modal-carbs').value=currentProfileData.custom_carbs||'';
  document.getElementById('norm-modal').classList.add('active');
}

function closeCustomNormModal(){
  var m=document.getElementById('norm-modal');
  if(m)m.classList.remove('active');
}

function saveCustomNormFromModal(){
  if(!currentProfileData)return;
  currentProfileData.custom_calories=document.getElementById('modal-calories').value;
  currentProfileData.custom_protein=document.getElementById('modal-protein').value;
  currentProfileData.custom_fat=document.getElementById('modal-fat').value;
  currentProfileData.custom_carbs=document.getElementById('modal-carbs').value;
  localStorage.setItem('cachedProfile',JSON.stringify(currentProfileData));
  saveProgressToCloud(localStorage.getItem('tgId'),localStorage.getItem('currentEmail'),localStorage.getItem('userName'),currentProfileData,currentXP,totalBurnedCalories);
  updateDashboard();
  closeCustomNormModal();
}

function renderProfile(profile){
  keepExtras(profile);
  currentProfileData=profile;
  window.currentProfileData=profile;
  userGender=profile.gender||'male';
  document.body.className=userGender==='female'?'female-theme':'male-theme';
  currentXP=parseInt(localStorage.getItem('cachedXP')||0);
  totalBurnedCalories=parseInt(localStorage.getItem('cachedBurned')||0);
  if(document.getElementById('burned-total'))document.getElementById('burned-total').innerText=totalBurnedCalories+' ккал';
  updateDashboard();
  updateCharacterUI();
  openScreen('dashboard-screen');

  var st=streakFromRecord({
    challenge_streak:parseInt(localStorage.getItem('streakCount')||0),
    challenge_last_date:localStorage.getItem('streakLastDate')||null
  });
  updateStreakUI(st.streak,!st.doneToday);

  refreshUserFromCloud();

  setTimeout(function(){
    var v=document.getElementById('character-video');
    if(!v)return;
    var levels=levelsData[userGender];
    var idx=0;
    for(var i=0;i<levels.length;i++){
      if(currentXP>=levels[i].xp)idx=i;
    }
    var lv=levels[idx];
    if(v.src.indexOf(lv.video)===-1){
      v.src=lv.video;
      v.load();
      v.play().catch(function(){console.log('Autoplay blocked');});
    }
  },1000);
}

function updateCharacterUI(){
  var levels=levelsData[userGender];
  var idx=0;
  for(var i=0;i<levels.length;i++){
    if(currentXP>=levels[i].xp)idx=i;
  }
  var lv=levels[idx];
  currentLevelIndex=idx;
  if(document.getElementById('char-level'))document.getElementById('char-level').innerText='Уровень '+(idx+1)+' / '+levels.length;
  if(document.getElementById('char-title'))document.getElementById('char-title').innerText=lv.title;
  if(document.getElementById('xp-text'))document.getElementById('xp-text').innerText=currentXP+' XP';
  var next=100;
  if(idx+1<levels.length)next=levels[idx+1].xp;
  var pct=currentXP/next*100;
  if(pct>100)pct=100;
  if(document.getElementById('xp-bar'))document.getElementById('xp-bar').style.width=pct+'%';
}

function openProfileSettings(){
  try{
    var type=localStorage.getItem('loginType')||'telegram';
    if(type==='telegram'){
      document.getElementById('link-title').innerText='Привязка Email';
      document.getElementById('link-desc').innerText='Привяжите Email, чтобы заходить с любого устройства.';
      var le=localStorage.getItem('linkedEmail');
      var box=document.getElementById('link-email-form');
      if(le){
        box.innerHTML='<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Email привязан: '+le+'</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkEmail()">Отвязать Email</button>';
      }else{
        box.innerHTML='<div class="form-group" style="margin-bottom: 10px;"><input type="email" id="link-email" placeholder="your@email.com" style="padding: 10px;"></div><div class="form-group" style="margin-bottom: 10px;"><input type="password" id="link-password" placeholder="Пароль (мин. 6 символов)" style="padding: 10px;"></div><button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkEmailToTelegram()">Привязать Email</button>';
      }
      box.style.display='block';
      document.getElementById('link-tg-form').style.display='none';
    }else{
      document.getElementById('link-title').innerText='Привязка Telegram';
      document.getElementById('link-desc').innerText='Ваш Telegram ID для входа с телефона.';
      var tid=localStorage.getItem('tgId');
      var tbox=document.getElementById('link-tg-form');
      if(tid){
        tbox.innerHTML='<p style="color: #34c759; font-size: 14px; font-weight: bold; margin-top: 10px;">✅ Telegram привязан: '+tid+'</p><button class="btn" style="background-color: #ff3b30; color: white; margin-top: 10px; padding: 12px; font-size: 15px;" onclick="unlinkTelegram()">Отвязать Telegram</button>';
      }else if(tg.initDataUnsafe&&tg.initDataUnsafe.user){
        tbox.innerHTML='<p style="font-size: 14px; color: #fff; margin-bottom: 10px;">Ваш Telegram ID: <b>'+tg.initDataUnsafe.user.id+'</b></p><button class="btn" style="padding: 12px; font-size: 15px;" onclick="linkTelegramToEmail()">Привязать Telegram</button>';
      }
      document.getElementById('link-email-form').style.display='none';
      tbox.style.display='block';
    }
    var cached=localStorage.getItem('cachedProfile');
    if(cached){
      var p=JSON.parse(cached);
      var setIf=function(id,val){var el=document.getElementById(id);if(el)el.value=val;};
      setIf('age',p.age||'');
      setIf('weight',p.weight||'');
      setIf('height',p.height||'');
      setIf('gender',p.gender||'male');
      setIf('goal',p.goal||'lose');
      setIf('custom-calories',p.custom_calories||'');
      setIf('custom-protein',p.custom_protein||'');
      setIf('custom-fat',p.custom_fat||'');
      setIf('custom-carbs',p.custom_carbs||'');
      setIf('custom-water-goal',p.custom_water_goal||'');
      setIf('food-preference',p.food_preference||'');
    }
    openScreen('profile-settings-screen');
  }catch(err){
    tg.showAlert('Не удалось открыть настройки.');
  }
}

async function linkEmailToTelegram(){
  var email=document.getElementById('link-email').value;
  var pass=document.getElementById('link-password').value;
  if(!email||!pass){tg.showAlert('Заполните Email и пароль!');return;}
  var tid=tg.initDataUnsafe&&tg.initDataUnsafe.user?tg.initDataUnsafe.user.id:localStorage.getItem('tgId');
  if(!tid){tg.showAlert('Ошибка: Telegram не найден.');return;}
  var chk=await supabaseClient.from('user_links').select('telegram_id').eq('email',email).maybeSingle();
  if(chk.data&&chk.data.telegram_id&&chk.data.telegram_id!=tid){
    tg.showAlert('Эта почта уже привязана к другому аккаунту Telegram!');
    return;
  }
  try{
    var up=await supabaseClient.auth.signUp({email:email,password:pass});
    if(up.error&&up.error.message!=='User already registered'){
      tg.showAlert('Ошибка: '+up.error.message);
      return;
    }
    var prof=JSON.parse(localStorage.getItem('cachedProfile'));
    var xp=parseInt(localStorage.getItem('cachedXP')||0);
    var burned=parseInt(localStorage.getItem('cachedBurned')||0);
    var nm=localStorage.getItem('userName')||'Атлет';
    await saveProgressToCloud(tid,email,nm,prof,xp,burned);
    localStorage.setItem('linkedEmail',email);
    localStorage.setItem('currentEmail',email);
    tg.showAlert('Email успешно привязан!');
    openProfileSettings();
  }catch(err){
    tg.showAlert('Ошибка сети.');
  }
}

async function linkTelegramToEmail(){
  var tid=tg.initDataUnsafe&&tg.initDataUnsafe.user?tg.initDataUnsafe.user.id:null;
  var nm=tg.initDataUnsafe&&tg.initDataUnsafe.user?tg.initDataUnsafe.user.first_name:'Атлет';
  var email=localStorage.getItem('currentEmail')||localStorage.getItem('linkedEmail');
  if(!tid||!email){tg.showAlert('Ошибка: не найден Email или Telegram ID.');return;}
  var chk=await supabaseClient.from('user_links').select('email').eq('telegram_id',tid).maybeSingle();
  if(chk.data&&chk.data.email&&chk.data.email!==email){
    tg.showAlert('Этот Telegram уже привязан к другой почте!');
    return;
  }
  var prof=JSON.parse(localStorage.getItem('cachedProfile'));
  var xp=parseInt(localStorage.getItem('cachedXP')||0);
  var burned=parseInt(localStorage.getItem('cachedBurned')||0);
  await saveProgressToCloud(tid,email,nm,prof,xp,burned);
  localStorage.setItem('tgId',tid);
  localStorage.setItem('userName',nm);
  tg.showAlert('Telegram успешно привязан!');
  openProfileSettings();
}

async function unlinkEmail(){
  if(!confirm('Отвязать Email? Прогресс останется в Telegram.'))return;
  var tid=localStorage.getItem('tgId');
  if(tid){
    var rec=await resolveUserRecord(tid,null);
    if(rec)await supabaseClient.from('user_links').update({email:null}).eq('id',rec.id);
  }
  localStorage.removeItem('linkedEmail');
  localStorage.removeItem('currentEmail');
  tg.showAlert('Email отвязан.');
  openProfileSettings();
}

async function unlinkTelegram(){
  if(!confirm('Отвязать Telegram? Прогресс останется в Email.'))return;
  var email=localStorage.getItem('currentEmail');
  if(email){
    var rec=await resolveUserRecord(null,email);
    if(rec)await supabaseClient.from('user_links').update({telegram_id:null}).eq('id',rec.id);
  }
  localStorage.removeItem('tgId');
  tg.showAlert('Telegram отвязан.');
  openProfileSettings();
}

async function saveProfile(){
  var age=document.getElementById('age').value;
  var gender=document.getElementById('gender').value;
  var weight=document.getElementById('weight').value;
  var height=document.getElementById('height').value;
  var goal=document.getElementById('goal').value;
  var cc=document.getElementById('custom-calories').value;
  var cp=document.getElementById('custom-protein').value;
  var cf=document.getElementById('custom-fat').value;
  var ccar=document.getElementById('custom-carbs').value;
  var cw=document.getElementById('custom-water-goal').value;
  var pref=document.getElementById('food-preference').value;
  if(!age||!weight||!height){tg.showAlert('Заполни все поля!');return;}
  var oldW=currentProfileData?parseFloat(currentProfileData.weight):null;
  var newW=parseFloat(weight);
  if(oldW&&oldW!==newW)saveWeightToHistory(newW);
  var prof={age:age,gender:gender,weight:weight,height:height,goal:goal,custom_calories:cc,custom_protein:cp,custom_fat:cf,custom_carbs:ccar,custom_water_goal:parseInt(cw)||2000,food_preference:pref};
  keepExtras(prof);
  localStorage.setItem('cachedProfile',JSON.stringify(prof));
  await saveProgressToCloud(localStorage.getItem('tgId'),localStorage.getItem('currentEmail'),localStorage.getItem('userName'),prof,currentXP,totalBurnedCalories);
  renderProfile(prof);
  tg.showAlert('Данные сохранены!');
}

async function logout(){
  if(!confirm('Выйти из аккаунта? Прогресс сохранен.'))return;
  localStorage.clear();
  sessionStorage.clear();
  await supabaseClient.auth.signOut();
  location.reload();
}