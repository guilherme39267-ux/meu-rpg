const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;

// Serve static files from both root and /public (works locally and on Render)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Expose root folder for assets (fundo.jpg, personagem.jpg, etc)
app.use('/assets', express.static(__dirname));

// Serve index.html for the root route
app.get('/', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else {
        res.sendFile(rootPath);
    }
});

// Store connected players
const players = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    players[socket.id] = { x: 400, y: 450, id: socket.id };
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('chatMessage', (msgText) => {
        io.emit('chatMessage', { id: socket.id, text: msgText });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
