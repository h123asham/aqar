import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { format } from 'date-fns';
import {
  Search,
  Send,
  Image as ImageIcon,
  Paperclip,
  Smile,
  MoreVertical,
  Phone,
  Video,
  User,
  Circle,
  MessageSquare,
  Edit3,
  Trash2,
  Check,
  CheckCheck,
  X,
  Camera,
  Upload,
  Download,
  PhoneCall,
  PhoneOff,
  VideoOff,
  Mic,
  MicOff,
} from 'lucide-react';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { toast } from 'react-toastify';

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'call';
  imageUrl?: string;
  fileName?: string;
  fileUrl?: string;
  callDuration?: number;
  callStatus?: 'missed' | 'answered' | 'declined';
  timestamp: string;
  read: boolean;
  edited?: boolean;
  editedAt?: string;
}

interface ChatUser {
  id: string;
  displayName: string;
  photoURL?: string;
  lastSeen?: string;
  online: boolean;
  typing?: boolean;
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

const Messages = () => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video' | null>(null);
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const emojis = ['😀', '😂', '😍', '🥰', '😊', '😎', '🤔', '😢', '😡', '👍', '👎', '❤️', '🔥', '💯', '🎉', '👏'];

  useEffect(() => {
    if (!user) return;

    // Connect to Socket.IO server
    const socketInstance = io('ws://localhost:3001', {
      auth: {
        token: user.uid,
        userId: user.uid,
        userName: user.displayName,
      },
    });

    socketInstance.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socketInstance.on('message', (message: Message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
      
      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    });

    socketInstance.on('messageEdited', (updatedMessage: Message) => {
      setMessages(prev => prev.map(msg => 
        msg.id === updatedMessage.id ? updatedMessage : msg
      ));
    });

    socketInstance.on('messageDeleted', (messageId: string) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    });

    socketInstance.on('userOnline', (userId: string) => {
      setChatUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, online: true } : u))
      );
    });

    socketInstance.on('userOffline', (userId: string) => {
      setChatUsers(prev =>
        prev.map(u => (u.id === userId ? { ...u, online: false } : u))
      );
    });

    socketInstance.on('userTyping', ({ userId, isTyping: typing }: { userId: string, isTyping: boolean }) => {
      if (userId !== user.uid) {
        setChatUsers(prev =>
          prev.map(u => (u.id === userId ? { ...u, typing } : u))
        );
      }
    });

    socketInstance.on('callInitiated', ({ from, type }: { from: string, type: 'voice' | 'video' }) => {
      setInCall(true);
      setCallType(type);
      setCallStatus('ringing');
      toast.info(`Incoming ${type} call from ${chatUsers.find(u => u.id === from)?.displayName || 'Unknown'}`);
    });

    socketInstance.on('callAnswered', () => {
      setCallStatus('connected');
      toast.success('Call connected');
    });

    socketInstance.on('callDeclined', () => {
      setInCall(false);
      setCallType(null);
      setCallStatus(null);
      toast.info('Call declined');
    });

    socketInstance.on('callEnded', () => {
      setInCall(false);
      setCallType(null);
      setCallStatus(null);
      toast.info('Call ended');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchChats = async () => {
      try {
        const chatsQuery = query(
          collection(db, 'chats'),
          where('participants', 'array-contains', user.uid),
          orderBy('lastMessageAt', 'desc')
        );
        
        const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
          const chatsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            lastMessageAt: doc.data().lastMessageAt?.toDate?.()?.toISOString() || doc.data().lastMessageAt
          })) as Chat[];

          setChats(chatsData);

          // Get unique user IDs
          const userIds = new Set<string>();
          chatsData.forEach(chat => {
            chat.participants.forEach(id => {
              if (id !== user.uid) userIds.add(id);
            });
          });

          if (userIds.size > 0) {
            const usersQuery = query(
              collection(db, 'users'),
              where('uid', 'in', Array.from(userIds))
            );
            
            const usersSnapshot = await getDocs(usersQuery);
            const usersData = usersSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              online: false,
              typing: false,
            })) as ChatUser[];

            setChatUsers(usersData);
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error fetching chats:', error);
        toast.error('Failed to load chats');
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, [user]);

  useEffect(() => {
    if (!selectedChat) return;

    const messagesQuery = query(
      collection(db, 'messages'),
      where('chatId', '==', selectedChat.id),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || doc.data().timestamp
      })) as Message[];

      setMessages(messagesData);
      scrollToBottom();

      // Mark messages as read
      messagesData.forEach(async (message) => {
        if (message.receiverId === user?.uid && !message.read) {
          await updateDoc(doc(db, 'messages', message.id), { read: true });
        }
      });
    });

    return unsubscribe;
  }, [selectedChat, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!user || !selectedUser || !selectedChat || !newMessage.trim() || !socket) return;

    try {
      const messageData = {
        chatId: selectedChat.id,
        senderId: user.uid,
        receiverId: selectedUser.id,
        content: newMessage,
        type: 'text' as const,
        timestamp: serverTimestamp(),
        read: false,
      };

      const docRef = await addDoc(collection(db, 'messages'), messageData);

      // Update chat's last message
      await updateDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: newMessage,
        lastMessageAt: serverTimestamp(),
      });

      // Send through Socket.IO
      socket.emit('message', {
        ...messageData,
        id: docRef.id,
        timestamp: new Date().toISOString(),
      });

      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const handleEditMessage = async () => {
    if (!editingMessage || !editContent.trim()) return;

    try {
      await updateDoc(doc(db, 'messages', editingMessage.id), {
        content: editContent,
        edited: true,
        editedAt: serverTimestamp(),
      });

      if (socket) {
        socket.emit('messageEdited', {
          ...editingMessage,
          content: editContent,
          edited: true,
          editedAt: new Date().toISOString(),
        });
      }

      setEditingMessage(null);
      setEditContent('');
      toast.success('Message updated');
    } catch (error) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;

    try {
      await deleteDoc(doc(db, 'messages', messageId));

      if (socket) {
        socket.emit('messageDeleted', messageId);
      }

      toast.success('Message deleted');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) return;

    try {
      // Delete all messages in the chat
      const messagesQuery = query(
        collection(db, 'messages'),
        where('chatId', '==', chatId)
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      
      const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Delete the chat
      await deleteDoc(doc(db, 'chats', chatId));

      // Reset selected chat if it was the deleted one
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        setSelectedUser(null);
        setMessages([]);
      }

      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!user || !selectedUser || !selectedChat || !socket) return;

    setUploadingImage(true);
    try {
      const storageRef = ref(storage, `chat-images/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      const messageData = {
        chatId: selectedChat.id,
        senderId: user.uid,
        receiverId: selectedUser.id,
        content: 'Image',
        type: 'image' as const,
        imageUrl,
        timestamp: serverTimestamp(),
        read: false,
      };

      const docRef = await addDoc(collection(db, 'messages'), messageData);

      // Update chat's last message
      await updateDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: 'Image',
        lastMessageAt: serverTimestamp(),
      });

      // Send through Socket.IO
      socket.emit('message', {
        ...messageData,
        id: docRef.id,
        timestamp: new Date().toISOString(),
      });

      toast.success('Image sent');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to send image');
    } finally {
      setUploadingImage(false);
      setShowImageUpload(false);
    }
  };

  const handleTyping = () => {
    if (!socket || !selectedUser) return;

    setIsTyping(true);
    socket.emit('typing', { receiverId: selectedUser.id, isTyping: true });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing', { receiverId: selectedUser.id, isTyping: false });
    }, 1000);
  };

  const initiateCall = async (type: 'voice' | 'video') => {
    if (!socket || !selectedUser) return;

    setInCall(true);
    setCallType(type);
    setCallStatus('calling');

    socket.emit('initiateCall', {
      receiverId: selectedUser.id,
      type,
    });

    // Add call message to chat
    const messageData = {
      chatId: selectedChat?.id,
      senderId: user?.uid,
      receiverId: selectedUser.id,
      content: `${type} call`,
      type: 'call' as const,
      callStatus: 'calling' as const,
      timestamp: serverTimestamp(),
      read: false,
    };

    await addDoc(collection(db, 'messages'), messageData);
  };

  const answerCall = () => {
    if (!socket) return;
    
    socket.emit('answerCall');
    setCallStatus('connected');
  };

  const declineCall = () => {
    if (!socket) return;
    
    socket.emit('declineCall');
    setInCall(false);
    setCallType(null);
    setCallStatus(null);
  };

  const endCall = () => {
    if (!socket) return;
    
    socket.emit('endCall');
    setInCall(false);
    setCallType(null);
    setCallStatus(null);
  };

  const selectChat = (chat: Chat, chatUser: ChatUser) => {
    setSelectedChat(chat);
    setSelectedUser(chatUser);
  };

  const filteredChats = chats.filter(chat => {
    const otherUserId = chat.participants.find(id => id !== user?.uid);
    const chatUser = chatUsers.find(u => u.id === otherUserId);
    return chatUser?.displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <DashboardLayout title="Messages">
      <div className="bg-white rounded-xl shadow-sm overflow-hidden h-[calc(100vh-12rem)]">
        <div className="flex h-full">
          {/* Chats List */}
          <div className="w-80 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="text-center py-8">
                  <User className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-gray-500">No conversations found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredChats.map((chat) => {
                    const otherUserId = chat.participants.find(id => id !== user?.uid);
                    const chatUser = chatUsers.find(u => u.id === otherUserId);
                    
                    if (!chatUser) return null;

                    return (
                      <div
                        key={chat.id}
                        className={`relative p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedChat?.id === chat.id ? 'bg-gray-50' : ''
                        }`}
                        onClick={() => selectChat(chat, chatUser)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1">
                            <div className="relative">
                              {chatUser.photoURL ? (
                                <img
                                  src={chatUser.photoURL}
                                  alt={chatUser.displayName}
                                  className="w-12 h-12 rounded-full"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                                  {chatUser.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              {chatUser.online && (
                                <Circle className="absolute bottom-0 right-0 h-3 w-3 text-success-500 fill-current" />
                              )}
                            </div>
                            <div className="ml-4 flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-gray-900 truncate">
                                {chatUser.displayName}
                              </h4>
                              <p className="text-xs text-gray-500 truncate">
                                {chatUser.typing ? 'Typing...' : chat.lastMessage}
                              </p>
                              <p className="text-xs text-gray-400">
                                {format(new Date(chat.lastMessageAt), 'HH:mm')}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            {chat.unreadCount > 0 && (
                              <span className="bg-primary-600 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                                {chat.unreadCount}
                              </span>
                            )}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Show chat options menu
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Chat Area */}
          {selectedUser && selectedChat ? (
            <div className="flex-1 flex flex-col">
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center">
                  {selectedUser.photoURL ? (
                    <img
                      src={selectedUser.photoURL}
                      alt={selectedUser.displayName}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center">
                      {selectedUser.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-gray-900">
                      {selectedUser.displayName}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {selectedUser.typing ? 'Typing...' : selectedUser.online ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => initiateCall('voice')}
                    className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    disabled={inCall}
                  >
                    <Phone className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => initiateCall('video')}
                    className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    disabled={inCall}
                  >
                    <Video className="h-5 w-5" />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => {
                        // Show chat options
                      }}
                      className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>
                    {/* Chat options dropdown would go here */}
                  </div>
                  <button
                    onClick={() => handleDeleteChat(selectedChat.id)}
                    className="p-2 text-error-500 hover:text-error-600 rounded-full hover:bg-error-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Call Interface */}
              {inCall && (
                <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                      {callType === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-medium">{selectedUser.displayName}</p>
                      <p className="text-sm text-gray-300">
                        {callStatus === 'calling' && 'Calling...'}
                        {callStatus === 'ringing' && 'Incoming call'}
                        {callStatus === 'connected' && 'Connected'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    {callStatus === 'ringing' && (
                      <>
                        <button
                          onClick={answerCall}
                          className="p-3 bg-success-600 rounded-full hover:bg-success-700"
                        >
                          <PhoneCall className="h-5 w-5" />
                        </button>
                        <button
                          onClick={declineCall}
                          className="p-3 bg-error-600 rounded-full hover:bg-error-700"
                        >
                          <PhoneOff className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    
                    {callStatus === 'connected' && (
                      <>
                        <button
                          onClick={() => setIsMuted(!isMuted)}
                          className={`p-3 rounded-full ${isMuted ? 'bg-error-600' : 'bg-gray-600'} hover:bg-opacity-80`}
                        >
                          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                        </button>
                        
                        {callType === 'video' && (
                          <button
                            onClick={() => setIsVideoOff(!isVideoOff)}
                            className={`p-3 rounded-full ${isVideoOff ? 'bg-error-600' : 'bg-gray-600'} hover:bg-opacity-80`}
                          >
                            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                          </button>
                        )}
                        
                        <button
                          onClick={endCall}
                          className="p-3 bg-error-600 rounded-full hover:bg-error-700"
                        >
                          <PhoneOff className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.senderId === user?.uid ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`group relative max-w-[70%] ${
                          message.senderId === user?.uid ? 'ml-auto' : 'mr-auto'
                        }`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 ${
                            message.senderId === user?.uid
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {message.type === 'image' && message.imageUrl && (
                            <img
                              src={message.imageUrl}
                              alt="Shared image"
                              className="max-w-full h-auto rounded-lg mb-2"
                            />
                          )}
                          
                          {message.type === 'call' && (
                            <div className="flex items-center">
                              <Phone className="h-4 w-4 mr-2" />
                              <span className="text-sm">
                                {message.callStatus === 'missed' && 'Missed call'}
                                {message.callStatus === 'answered' && `Call duration: ${message.callDuration || 0}s`}
                                {message.callStatus === 'declined' && 'Call declined'}
                              </span>
                            </div>
                          )}
                          
                          {message.type === 'text' && (
                            <p className="text-sm">{message.content}</p>
                          )}
                          
                          <div className="flex items-center justify-between mt-1">
                            <p
                              className={`text-xs ${
                                message.senderId === user?.uid
                                  ? 'text-primary-100'
                                  : 'text-gray-500'
                              }`}
                            >
                              {format(new Date(message.timestamp), 'HH:mm')}
                              {message.edited && ' (edited)'}
                            </p>
                            
                            {message.senderId === user?.uid && (
                              <div className="flex items-center ml-2">
                                {message.read ? (
                                  <CheckCheck className="h-3 w-3 text-primary-200" />
                                ) : (
                                  <Check className="h-3 w-3 text-primary-200" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Message Actions */}
                        {message.senderId === user?.uid && message.type === 'text' && (
                          <div className="absolute top-0 right-0 transform translate-x-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center space-x-1 ml-2">
                              <button
                                onClick={() => {
                                  setEditingMessage(message);
                                  setEditContent(message.content);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteMessage(message.id)}
                                className="p-1 text-error-400 hover:text-error-600 rounded"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200">
                {editingMessage ? (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-yellow-800">Editing message</span>
                      <button
                        onClick={() => {
                          setEditingMessage(null);
                          setEditContent('');
                        }}
                        className="text-yellow-600 hover:text-yellow-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleEditMessage();
                        }}
                        className="flex-1 px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                        placeholder="Edit your message..."
                      />
                      <button
                        onClick={handleEditMessage}
                        disabled={!editContent.trim()}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Smile className="h-5 w-5" />
                    </button>
                    
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 grid grid-cols-8 gap-1">
                        {emojis.map((emoji, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setNewMessage(prev => prev + emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="p-1 hover:bg-gray-100 rounded text-lg"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowImageUpload(!showImageUpload)}
                      className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <ImageIcon className="h-5 w-5" />
                    </button>
                    
                    {showImageUpload && (
                      <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImageUpload(file);
                            }
                          }}
                          className="hidden"
                        />
                        <div className="space-y-2">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                            disabled={uploadingImage}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {uploadingImage ? 'Uploading...' : 'Upload Image'}
                          </button>
                          <button
                            onClick={() => {
                              // Camera functionality would go here
                              toast.info('Camera feature coming soon');
                            }}
                            className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            Take Photo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button className="p-2 text-gray-500 hover:text-gray-600 rounded-full hover:bg-gray-100">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => {
                      setNewMessage(e.target.value);
                      handleTyping();
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">
                  Select a conversation
                </h3>
                <p className="mt-1 text-gray-500">
                  Choose a user from the list to start chatting
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Messages;