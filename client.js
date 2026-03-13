// Socket reference
let socket;

// Config for Phaser 3
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: { y: 1500 } // Heavier platformer style gravity
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let otherPlayers;
let cursors;
let wasd;
let spaceKey;
let platforms;
let debugGraphics;

// Set to true to see where the platforms are so you can adjust their positions
const DEBUG_PLATFORMS = true; // <- mude para false quando estiver satisfeito com a posição

// ─── PLATFORM DEFINITIONS ──────────────────────────────────────────────────────
// cx = centro X, cy = centro Y, w = largura, h = altura (tudo em % da tela: 0.0 a 1.0)
// Ajuste os valores de cy para subir/descer e cx/w para mover/redimensionar
const PLATFORM_DEFS = [
    // Chão principal (alinhado com a grama verde do fundo)
    { cx: 0.50, cy: 0.80, w: 1.00, h: 0.04 },
    // Pedra grande do centro-esquerda
    { cx: 0.38, cy: 0.75, w: 0.10, h: 0.03 },
    // Pedra grande do centro
    { cx: 0.52, cy: 0.74, w: 0.08, h: 0.03 },
    // Pedra da direita
    { cx: 0.80, cy: 0.76, w: 0.09, h: 0.03 },
];
// ──────────────────────────────────────────────────────────────────────────────

// Jump mechanics variables
let isJumping = false;
let jumpTimer = 0;
const MAX_JUMP_TIME = 1000; // 1 second max hold

// Main character reference for the current client
let playerSprite; 

function preload() {
    // Load visual assets. Using the ones provided in the requested folder if available.
    // Ensure the server serves the root folder as '/assets' for these to work.
    this.load.image('background', '/assets/fundo.jpg'); 
    // Load as spritesheet instead of image. The image is 1078x453. 
    // Assuming 6 frames horizontally and 2 vertically based on the image format.
    // Width: 1078 / 6 = 179.6 (round to 180), Height: 453 / 2 = 226.5 (round to 226)
    // We adjust slightly to fit the actual frames
    this.load.spritesheet('player_base', '/assets/personagem.jpg', { 
        frameWidth: 179, 
        frameHeight: 226 
    }); 
}

function create() {
    // Add the background to cover the screen
    let bg = this.add.image(0, 0, 'background').setOrigin(0, 0);
    // Scale background to fit screen
    bg.displayWidth = window.innerWidth;
    bg.displayHeight = window.innerHeight;

    // Build all platforms from the PLATFORM_DEFS list above
    platforms = this.physics.add.staticGroup();
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Debug graphics layer (shows platform outlines when DEBUG_PLATFORMS = true)
    debugGraphics = this.add.graphics();

    PLATFORM_DEFS.forEach(def => {
        const px = def.cx * W;
        const py = def.cy * H;
        const pw = def.w * W;
        const ph = def.h * H;

        const rect = this.add.rectangle(px, py, pw, ph, 0x4444ff, DEBUG_PLATFORMS ? 0.35 : 0);
        platforms.add(rect);

        if (DEBUG_PLATFORMS) {
            debugGraphics.lineStyle(2, 0x00ffff, 1);
            debugGraphics.strokeRect(px - pw / 2, py - ph / 2, pw, ph);
        }
    });

    // A group to hold all other players' sprites
    otherPlayers = this.physics.add.group();

    // Setup animations
    this.anims.create({
        key: 'idle',
        frames: this.anims.generateFrameNumbers('player_base', { start: 0, end: 1 }), // Using first two frames for idle
        frameRate: 3,
        repeat: -1
    });

    this.anims.create({
        key: 'walk',
        frames: this.anims.generateFrameNumbers('player_base', { start: 2, end: 5 }), // Using next frames for walking
        frameRate: 8,
        repeat: -1
    });

    // Initialize Socket.io now that Phaser is ready
    socket = io();

    // 1. Listen for current players already in the room
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (players[id].id === socket.id) {
                // This is our character
                addPlayer(this, players[id]);
            } else {
                // An existing other character
                addOtherPlayer(this, players[id]);
            }
        });
    });

    // 2. Listen for a new player entering
    socket.on('newPlayer', (playerInfo) => {
        addOtherPlayer(this, playerInfo);
    });

    // 3. Listen for other players disconnecting
    socket.on('playerDisconnected', (id) => {
        otherPlayers.getChildren().forEach((otherPlayer) => {
            if (id === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });

    // 4. Listen for other players moving
    socket.on('playerMoved', (playerInfo) => {
        otherPlayers.getChildren().forEach((otherPlayer) => {
            if (playerInfo.id === otherPlayer.playerId) {
                // Determine direction based on x movement
                if (playerInfo.x < otherPlayer.x) {
                    otherPlayer.setFlipX(true); // Face left
                } else if (playerInfo.x > otherPlayer.x) {
                    otherPlayer.setFlipX(false); // Face right
                }

                // If position changed, play walk animation, else idle
                if (playerInfo.x !== otherPlayer.x || playerInfo.y !== otherPlayer.y) {
                    otherPlayer.anims.play('walk', true);
                } else {
                    otherPlayer.anims.play('idle', true);
                }

                // Smoothly update their position
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });

    // Setup Keyboard inputs (Arrows)
    cursors = this.input.keyboard.createCursorKeys();
    // Setup WASD
    wasd = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });
    // Setup Space for jumping
    spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Handle Window Resize
    this.scale.on('resize', (gameSize) => {
        bg.displayWidth = gameSize.width;
        bg.displayHeight = gameSize.height;
    });

    // --- Chat System Logic ---
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messagesBox = document.getElementById('chat-messages');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) {
            socket.emit('chatMessage', input.value);
            input.value = '';
            
            // Re-focus the game canvas so keyboard controls resume working instantly
            game.canvas.focus(); 
        }
    });

    // Stop propagation of key presses when typing in the chat!
    input.addEventListener('keydown', (e) => {
        e.stopPropagation(); 
    });

    socket.on('chatMessage', (msg) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (msg.id === socket.id ? 'self' : '');
        
        const idSpan = document.createElement('span');
        idSpan.className = 'id';
        // Display a shortened ID for readability
        idSpan.textContent = msg.id.substring(0, 4) + ': ';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = msg.text;

        messageDiv.appendChild(idSpan);
        messageDiv.appendChild(textSpan);

        messagesBox.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        messagesBox.scrollTop = messagesBox.scrollHeight;
    });
}

function update(time, delta) {
    // Only process update loop if our player exists
    if (playerSprite) {
        let moved = false;
        
        // Stop movement immediately
        playerSprite.body.setVelocity(0);

        const SPEED = 200;

        // Horizontal movement
        if (cursors.left.isDown || wasd.left.isDown) {
            playerSprite.body.setVelocityX(-SPEED);
            playerSprite.setFlipX(true); // Face left
            moved = true;
        } else if (cursors.right.isDown || wasd.right.isDown) {
            playerSprite.body.setVelocityX(SPEED);
            playerSprite.setFlipX(false); // Face right
            moved = true;
        }

        // Jumping Mechanics (Variable height with Spacebar)
        
        // Start jump if touching ground and space is pressed
        if (Phaser.Input.Keyboard.JustDown(spaceKey) && playerSprite.body.touching.down) {
            isJumping = true;
            jumpTimer = 0;
            // Apply initial small jump burst so they leave the ground immediately
            playerSprite.body.setVelocityY(-600);
            moved = true;
        }

        // Continue jump if holding space, hasn't exceeded max time, and currently jumping
        if (spaceKey.isDown && isJumping) {
            jumpTimer += delta;
            
            if (jumpTimer < MAX_JUMP_TIME) {
                // Apply continuous upward force while held. 
                // We add a negative velocity to counteract gravity temporarily.
                playerSprite.body.setVelocityY(-700);
                moved = true;
            } else {
                // Max time reached, end the upward boost phase
                isJumping = false;
            }
        }

        // End jumping boost if space is released
        if (Phaser.Input.Keyboard.JustUp(spaceKey)) {
            isJumping = false;
        }
        
        // Play animation based on movement
        if (moved && playerSprite.body.touching.down) {
            playerSprite.anims.play('walk', true);
        } else {
            playerSprite.anims.play('idle', true);
        }
        
        // Keep inside bounds
        playerSprite.x = Phaser.Math.Clamp(playerSprite.x, 0, game.config.width);
        playerSprite.y = Phaser.Math.Clamp(playerSprite.y, 0, game.config.height);

        // Emit movement to the server ONLY if position actually changed
        if (moved) {
            socket.emit('playerMovement', {
                x: playerSprite.x,
                y: playerSprite.y
            });
        }
    }
}

// Helper to spawn the local player
function addPlayer(scene, playerInfo) {
    // We are currently using the bare image as a character. We scale it down because it might be too large.
    playerSprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player_base');
    playerSprite.setCollideWorldBounds(true); // Don't let player walk off-screen

    // Adjust scale since it's a spritesheet now, might not need 0.2
    playerSprite.setScale(0.5); 
    
    // Add collision between local player and platforms
    scene.physics.add.collider(playerSprite, platforms);
}

// Helper to spawn other players
function addOtherPlayer(scene, playerInfo) {
    const otherPlayer = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'player_base');
    otherPlayer.setScale(0.5);
    otherPlayer.setTint(0xffaaaa); // Tint other players slightly red
    otherPlayer.playerId = playerInfo.id;
    otherPlayers.add(otherPlayer);
    
    // Add collision between other players and platforms so they don't fall off either
    scene.physics.add.collider(otherPlayer, platforms);
}
