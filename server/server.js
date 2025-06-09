const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://your-production-domain.com'] 
      : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());

// Store connected users
const connectedUsers = new Map();
const userSockets = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (userData) => {
    const { userId, userName } = userData;
    
    // Store user information
    connectedUsers.set(userId, {
      socketId: socket.id,
      userName,
      online: true,
      lastSeen: new Date()
    });
    
    userSockets.set(socket.id, userId);
    
    // Notify other users that this user is online
    socket.broadcast.emit('userOnline', userId);
    
    console.log(`User ${userName} (${userId}) authenticated`);
  });

  // Handle sending messages
  socket.on('message', (messageData) => {
    const { receiverId, senderId, content, type, imageUrl, chatId } = messageData;
    
    // Find receiver's socket
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      // Send message to receiver
      io.to(receiverData.socketId).emit('message', messageData);
    }
    
    // Also send back to sender for confirmation
    socket.emit('messageDelivered', {
      messageId: messageData.id,
      delivered: !!receiverData,
      timestamp: new Date()
    });
    
    console.log(`Message sent from ${senderId} to ${receiverId}`);
  });

  // Handle message editing
  socket.on('messageEdited', (messageData) => {
    const { receiverId } = messageData;
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('messageEdited', messageData);
    }
  });

  // Handle message deletion
  socket.on('messageDeleted', (data) => {
    const { messageId, receiverId } = data;
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('messageDeleted', messageId);
    }
  });

  // Handle typing indicators
  socket.on('typing', (data) => {
    const { receiverId, isTyping } = data;
    const senderId = userSockets.get(socket.id);
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('userTyping', {
        userId: senderId,
        isTyping
      });
    }
  });

  // Handle call initiation
  socket.on('initiateCall', (data) => {
    const { receiverId, type } = data;
    const senderId = userSockets.get(socket.id);
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('callInitiated', {
        from: senderId,
        type,
        callId: `call_${Date.now()}`
      });
    }
  });

  // Handle call answer
  socket.on('answerCall', (data) => {
    const { callerId } = data;
    const receiverData = connectedUsers.get(callerId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('callAnswered');
    }
    
    socket.emit('callAnswered');
  });

  // Handle call decline
  socket.on('declineCall', (data) => {
    const { callerId } = data;
    const receiverData = connectedUsers.get(callerId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('callDeclined');
    }
  });

  // Handle call end
  socket.on('endCall', (data) => {
    const { participantId } = data;
    const participantData = connectedUsers.get(participantId);
    
    if (participantData) {
      io.to(participantData.socketId).emit('callEnded');
    }
  });

  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    const { receiverId, offer } = data;
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('offer', {
        from: userSockets.get(socket.id),
        offer
      });
    }
  });

  socket.on('answer', (data) => {
    const { callerId, answer } = data;
    const callerData = connectedUsers.get(callerId);
    
    if (callerData) {
      io.to(callerData.socketId).emit('answer', {
        from: userSockets.get(socket.id),
        answer
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const { receiverId, candidate } = data;
    const receiverData = connectedUsers.get(receiverId);
    
    if (receiverData) {
      io.to(receiverData.socketId).emit('ice-candidate', {
        from: userSockets.get(socket.id),
        candidate
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userId = userSockets.get(socket.id);
    
    if (userId) {
      // Update user status to offline
      const userData = connectedUsers.get(userId);
      if (userData) {
        userData.online = false;
        userData.lastSeen = new Date();
      }
      
      // Notify other users that this user is offline
      socket.broadcast.emit('userOffline', userId);
      
      // Clean up
      userSockets.delete(socket.id);
      
      console.log(`User ${userId} disconnected`);
    }
  });

  // Send initial authentication request
  socket.emit('requestAuth');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    connectedUsers: connectedUsers.size,
    timestamp: new Date()
  });
});

// Get connected users endpoint
app.get('/users', (req, res) => {
  const users = Array.from(connectedUsers.entries()).map(([userId, userData]) => ({
    userId,
    userName: userData.userName,
    online: userData.online,
    lastSeen: userData.lastSeen
  }));
  
  res.json(users);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});