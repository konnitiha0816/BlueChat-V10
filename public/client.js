const socket = io();
const peer = new Peer();
let myStream, screenStream, myNick, currentRoom;
let isMicOn = true, isCamOn = true;

const sndTitle = new Audio('/sounds/title.mp3'); sndTitle.loop = true;
const sndNotify = new Audio('/sounds/notify.mp3');
const sndSuccess = new Audio('https://www.soundjay.com/buttons/sounds/button-37.mp3');

// 画面遷移ユーティリティ
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

// 九九認証 (BGM停止&アニメーション)
let ans;
function startCaptcha() {
    sndTitle.pause();
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
        alert("計算間違いだにゃ！🐈");
        startCaptcha();
    }
}

// 参加・作成ロジック
function handleCreate() {
    myNick = document.getElementById('user-nick').value.trim();
    if(!myNick) return alert("名前を入力してください！");
    const id = prompt("部屋ID(6文字)を決めてください");
    if(id && id.length === 6) { 
        currentRoom = id; 
        socket.emit('create-room', id); 
    }
}

function handleJoin() {
    myNick = document.getElementById('user-nick').value.trim();
    const id = document.getElementById('join-id').value.trim();
    if(!myNick) return alert("名前を入力してください！");
    if(id.length !== 6) return alert("IDは6文字です！");
    currentRoom = id;
    socket.emit('request-join', { roomId: id, nickname: myNick });
}

// Socketイベント
socket.on('room-created', id => {
    startSession(id);
    document.getElementById('approval-box-container').style.display = 'block'; // ホスト用表示
});

socket.on('waiting-approval', () => { show('screen-wait'); });

socket.on('admin-approval-request', data => {
    sndNotify.play();
    addApprovalRequest(data);
    document.getElementById('side-bar').classList.add('open');
});

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

function approveUser(targetId) {
    socket.emit('approve-user', targetId);
    const item = document.getElementById('req-' + targetId);
    if(item) item.remove();
}

socket.on('join-approved', () => { startSession(currentRoom); });

// セッション開始 (HD画質)
async function startSession(roomId) {
    try {
        myStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }, audio: true
        });
        show('screen-call');
        document.getElementById('display-room-id').innerText = "ID: " + roomId;
        addVideo(myStream, myNick, true);
        socket.emit('join-call', { roomId: roomId, peerId: peer.id, nickname: myNick });
    } catch (e) { alert("カメラ・マイクの権限がありません！"); }
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

// 画面共有 (完全実装)
async function toggleScreenShare() {
    if(screenStream) {
        // 共有停止処理
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        return;
    }
    // 共有開始処理
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        addVideo(screenStream, "画面共有", false, true);
        
        // 接続中の全メンバーに映像を送る
        Object.values(peer.connections).forEach(connList => {
            connList.forEach(conn => {
                peer.call(conn.peer, screenStream);
            });
        });

        // 共有停止ボタンが押された時の処理
        screenStream.getVideoTracks()[0].onended = () => {
            const videoElem = document.getElementById('vid-' + screenStream.id);
            if(videoElem) videoElem.parentElement.remove();
            screenStream = null;
        };
    } catch(err) {
        console.log("共有キャンセル");
    }
}

// マイク・カメラ・サイドバー制御
function toggleMic() { 
    isMicOn = !isMicOn; 
    myStream.getAudioTracks()[0].enabled = isMicOn; 
    
    // 赤色(OFF)クラスの切り替え
    const btn = document.getElementById('btn-mic');
    if(isMicOn) btn.classList.remove('off'); // ONなら黒
    else btn.classList.add('off');          // OFFなら赤
}

function toggleCam() { 
    isCamOn = !isCamOn; 
    myStream.getVideoTracks()[0].enabled = isCamOn; 
    
    // 赤色(OFF)クラスの切り替え
    const btn = document.getElementById('btn-cam');
    if(isCamOn) btn.classList.remove('off'); // ONなら黒
    else btn.classList.add('off');          // OFFなら赤
}

function toggleSidebar() { document.getElementById('side-bar').classList.toggle('open'); }

// チャット機能 (修正済み)
function sendChat() {
    const input = document.getElementById('chat-in');
    const text = input.value.trim();
    if(text) { 
        socket.emit('send-chat', { roomId: currentRoom, sender: myNick, text: text }); 
        input.value = ""; 
    }
}

socket.on('receive-chat', data => {
    const logs = document.getElementById('chat-logs');
    const d = document.createElement('div'); 
    d.style.marginBottom = "10px";
    d.innerHTML = `<b style="color:#0078d4">${data.sender}:</b> ${data.text}`;
    logs.appendChild(d);
    // 自動スクロール
    logs.scrollTop = logs.scrollHeight;
});
