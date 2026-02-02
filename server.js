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
            // ホストへ承認要請を送る
            io.to(room.hostId).emit('admin-approval-request', { 
                senderId: socket.id, 
                nickname: data.nickname 
            });
            // ゲストには待機画面を出させる
            socket.emit('waiting-approval');
        } else {
            socket.emit('join-error', '部屋が見つかりません');
        }
    });

    // 承認実行
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

    // チャット送信
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });
});

server.listen(process.env.PORT || 3000);
