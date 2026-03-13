const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname))); // Expose root folder for assets (cidade.jpg, etc)

// Store connected players
const players = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new player
    players[socket.id] = {
        x: 400, // Initial X position
        y: 450, // Initial Y position
        id: socket.id
    };

    // Send current players to the new user
    socket.emit('currentPlayers', players);

    // Notify all other users about the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle player movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            // Broadcast the new position to everyone else
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (msgText) => {
        io.emit('chatMessage', { id: socket.id, text: msgText });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        // Notify others
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
