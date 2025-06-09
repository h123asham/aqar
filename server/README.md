# Aqar Socket.IO Server

This is the Socket.IO server for the Aqar messaging system, providing real-time communication features including:

- Real-time messaging
- Message editing and deletion
- Typing indicators
- Online/offline status
- Voice and video call signaling
- File sharing support

## Features

### Messaging
- ✅ Real-time message delivery
- ✅ Message read receipts
- ✅ Message editing
- ✅ Message deletion
- ✅ Typing indicators
- ✅ Image sharing
- ✅ Emoji support

### Calls
- ✅ Voice call initiation
- ✅ Video call initiation
- ✅ Call answer/decline
- ✅ Call status updates
- ✅ WebRTC signaling support

### User Presence
- ✅ Online/offline status
- ✅ Last seen timestamps
- ✅ User authentication

## Installation

```bash
cd server
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)

## API Endpoints

- `GET /health`: Health check
- `GET /users`: Get connected users

## Socket Events

### Client to Server
- `authenticate`: User authentication
- `message`: Send message
- `messageEdited`: Edit message
- `messageDeleted`: Delete message
- `typing`: Typing indicator
- `initiateCall`: Start call
- `answerCall`: Answer call
- `declineCall`: Decline call
- `endCall`: End call

### Server to Client
- `message`: Receive message
- `messageEdited`: Message edited
- `messageDeleted`: Message deleted
- `userOnline`: User came online
- `userOffline`: User went offline
- `userTyping`: User typing
- `callInitiated`: Incoming call
- `callAnswered`: Call answered
- `callDeclined`: Call declined
- `callEnded`: Call ended