const socket = io();
const peer = new Peer();
let myStream, screenStream, myNick, currentRoom;
let isMicOn = true, isCamOn = true;
let isHost = false; // ホスト判定用

const sndTitle = new Audio('/sounds/title.mp3'); sndTitle.loop = true;
// ⚠️ sndWaitは削除しました
const sndNotify = new Audio('/sounds/notify.mp3');
const sndSuccess = new Audio('https://www.soundjay.com/buttons/sounds/button-37.mp3');

// ユーティリティ
const show = (id) => {
    document.querySelectorAll('body > div.full, body > div#screen-call').forEach(d => d.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
};

function initApp() {
    show('screen-title');
    sndTitle.play();
    setInterval(() => {
        document.getElementById('display-time').innerText = new Date().toLocaleTimeString();
    }, 1000);
    const h = new Date().getHours();
    document.getElementById('body-bg').className = (h >= 5 && h < 17) ? 'day-bg' : 'night-bg';
}

// 九九認証
let ans;
function startCaptcha() {
    sndTitle.pause(); // BGM停止
    sndTitle.currentTime = 0;
    const a = Math.floor(Math.random()*9)+1, b = Math.floor(Math.random()*9)+1;
    ans = a * b;
    document.getElementById('kuku-q').innerText = `${a} × ${b} = ?`;
    show('screen-captcha');
}
function checkCaptcha() {
    if(parseInt(document.getElementById('kuku-a').value) === ans) {
        sndSuccess.play();
        const screen = document.getElementById('screen-captcha');
        const flash = document.getElementById('flash-effect');
        flash.classList.add('flash-active');
        screen.classList.add('success-zoom');
        setTimeout(() => {
            screen.classList.remove('success-zoom');
            flash.classList.remove('flash-active');
            show('screen-choice');
        }, 800);
    } else {
        alert("やり直し！");
        startCaptcha();
    }
}

// 参加・作成処理
function handleCreate() {
    myNick = document.getElementById('user-nick').value.trim();
    if(!myNick) return alert("名前を書いてください！");
    const id = prompt("部屋ID(6文字)");
    if(id && id.length === 6) { 
        currentRoom = id; 
        isHost = true; // ホストフラグON
        socket.emit('create-room', id); 
    }
}

function handleJoin() {
    myNick = document.getElementById('user-nick').value.trim();
    const id = document.getElementById('join-id').value.trim();
    if(!myNick) return alert("名前を書いてください！");
    if(id.length !== 6) return alert("IDは6文字です");
    currentRoom = id;
    socket.emit('request-join', { roomId: id, nickname: myNick });
}

// Socketイベント
socket.on('room-created', id => {
    startSession(id);
    // ホストならサイドバーの承認ボックスを表示設定にする
    document.getElementById('approval-box-container').style.display = 'block';
});

// 承認待ち（音楽なし）
socket.on('waiting-approval', () => {
    show('screen-wait');
});

// ホスト側の承認リクエスト受信処理
socket.on('admin-approval-request', data => {
    sndNotify.play();
    addApprovalRequest(data);
    // サイドバーを自動で開いて気付かせる
    document.getElementById('side-bar').classList.add('open');
});

// 承認ボックスへの追加
function addApprovalRequest(data) {
    const list = document.getElementById('approval-list');
    
    const item = document.createElement('div');
    item.className = 'approval-item';
    item.id = 'req-' + data.senderId;
    
    item.innerHTML = `
        <span>${data.nickname}</span>
        <button class="btn-approve" onclick="approveUser('${data.senderId}')">承認</button>
    `;
    list.appendChild(item);
}

// 承認実行
function approveUser(targetId) {
    socket.emit('approve-user', targetId);
    // リストから削除
    const item = document.getElementById('req-' + targetId);
    if(item) item.remove();
}

socket.on('join-approved', () => {
    startSession(currentRoom);
});

// 通話開始
async function startSession(roomId) {
    try {
        myStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }, audio: true
        });
        show('screen-call');
        document.getElementById('display-room-id').innerText = "ID: " + roomId;
        addVideo(myStream, myNick, true);
        socket.emit('join-call', { roomId: roomId, peerId: peer.id, nickname: myNick });
    } catch (e) { alert("カメラ許可が必要です"); }
}

peer.on('open', id => {});
peer.on('call', call => {
    call.answer(myStream);
    call.on('stream', s => addVideo(s, "参加者"));
});
socket.on('user-connected', data => {
    const call = peer.call(data.peerId, myStream);
    call.on('stream', s => addVideo(s, data.nickname));
});

function addVideo(stream, nickname, isMe = false, isScreen = false) {
    if (document.getElementById('vid-' + stream.id)) return;
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = 'cont-' + stream.id;

    const v = document.createElement('video');
    v.id = 'vid-' + stream.id; v.srcObject = stream; v.autoplay = true; v.playsinline = true;
    if(isMe) v.muted = true;
    if(isScreen) v.classList.add('screen-share');

    const label = document.createElement('div');
    label.className = 'nickname-label'; label.innerText = nickname;
    container.appendChild(v); container.appendChild(label);
    document.getElementById('video-grid').appendChild(container);
    stream.getVideoTracks()[0].onended = () => container.remove();
}

// ツール
async function toggleScreenShare() {
    if(screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; return; }
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    addVideo(screenStream, "画面共有", false, true);
    Object.values(peer.connections).forEach(c => peer.call(c[0].peer, screenStream));
}
function toggleMic() { isMicOn = !isMicOn; myStream.getAudioTracks()[0].enabled = isMicOn; document.getElementById('btn-mic').classList.toggle('off', !isMicOn); }
function toggleCam() { isCamOn = !isCamOn; myStream.getVideoTracks()[0].enabled = isCamOn; document.getElementById('btn-cam').classList.toggle('off', !isCamOn); }
function toggleSidebar() { document.getElementById('side-bar').classList.toggle('open'); }

function sendChat() {
    const input = document.getElementById('chat-in');
    if(input.value) { socket.emit('send-chat', { roomId: currentRoom, sender: myNick, text: input.value }); input.value = ""; }
}
socket.on('receive-chat', data => {
    const d = document.createElement('div'); d.style.marginBottom = "10px";
    d.innerHTML = `<b style="color:#0078d4">${data.sender}:</b> ${data.text}`;
    document.getElementById('chat-logs').appendChild(d);
});
