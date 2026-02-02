const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
const rooms = new Map();

io.on('connection', (socket) => {
    // 部屋作成
    socket.on('create-room', (roomId) => {
        rooms.set(roomId, { hostId: socket.id });
        socket.join(roomId);
        socket.emit('room-created', roomId);
    });

    // 参加リクエスト
    socket.on('request-join', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            // ホストへ通知
            io.to(room.hostId).emit('admin-approval-request', { 
                senderId: socket.id, 
                nickname: data.nickname 
            });
            // 申請者へ待機指示
            socket.emit('waiting-approval');
        } else {
            socket.emit('join-error', '部屋が見つかりません');
        }
    });

    // 承認処理
    socket.on('approve-user', (targetId) => {
        io.to(targetId).emit('join-approved');
    });

    // 通話参加 (PeerID交換)
    socket.on('join-call', (data) => {
        socket.join(data.roomId);
        socket.to(data.roomId).emit('user-connected', {
            peerId: data.peerId,
            nickname: data.nickname
        });
    });

    // 💬 チャット送信 (修正済み)
    socket.on('send-chat', (data) => {
        // ルーム内の全員（送信者含む）に配信
        io.to(data.roomId).emit('receive-chat', data);
    });
});

server.listen(process.env.PORT || 3000);
