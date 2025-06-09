import { useState, useEffect } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from 'lucide-react';

interface CallInterfaceProps {
  isActive: boolean;
  callType: 'voice' | 'video';
  status: 'calling' | 'ringing' | 'connected';
  participantName: string;
  participantAvatar?: string;
  onAnswer?: () => void;
  onDecline?: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo?: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
}

const CallInterface = ({
  isActive,
  callType,
  status,
  participantName,
  participantAvatar,
  onAnswer,
  onDecline,
  onEnd,
  onToggleMute,
  onToggleVideo,
  isMuted,
  isVideoOff,
}: CallInterfaceProps) => {
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMutedVolume, setIsMutedVolume] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (status === 'connected') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isActive) return null;

  return (
    <div className={`fixed inset-0 z-50 bg-gray-900 text-white flex flex-col ${
      isFullscreen ? '' : 'rounded-lg m-4'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black bg-opacity-30">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-3 overflow-hidden">
            {participantAvatar ? (
              <img src={participantAvatar} alt={participantName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-medium">
                {participantName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-medium">{participantName}</h3>
            <p className="text-sm text-gray-300">
              {status === 'calling' && 'Calling...'}
              {status === 'ringing' && 'Incoming call'}
              {status === 'connected' && formatDuration(duration)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Volume Control */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsMutedVolume(!isMutedVolume)}
              className="p-2 rounded-full hover:bg-white hover:bg-opacity-20"
            >
              {isMutedVolume ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMutedVolume ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-full hover:bg-white hover:bg-opacity-20"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Video Area */}
      {callType === 'video' && (
        <div className="flex-1 relative bg-black">
          {/* Remote Video */}
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            {isVideoOff ? (
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4">
                  {participantAvatar ? (
                    <img src={participantAvatar} alt={participantName} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-3xl font-medium">
                      {participantName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-gray-300">Camera is off</p>
              </div>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
                <p className="text-gray-300">Video feed would appear here</p>
              </div>
            )}
          </div>

          {/* Local Video (Picture-in-Picture) */}
          <div className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden border-2 border-white border-opacity-30">
            {isVideoOff ? (
              <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                <VideoOff className="h-6 w-6 text-gray-400" />
              </div>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-green-900 to-blue-900 flex items-center justify-center">
                <p className="text-xs text-gray-300">You</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voice Call Display */}
      {callType === 'voice' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-32 h-32 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-6 overflow-hidden">
              {participantAvatar ? (
                <img src={participantAvatar} alt={participantName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-medium">
                  {participantName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-medium mb-2">{participantName}</h2>
            <p className="text-gray-300">
              {status === 'calling' && 'Calling...'}
              {status === 'ringing' && 'Incoming voice call'}
              {status === 'connected' && `Call duration: ${formatDuration(duration)}`}
            </p>
          </div>
        </div>
      )}

      {/* Call Controls */}
      <div className="p-6 bg-black bg-opacity-30">
        <div className="flex items-center justify-center space-x-6">
          {/* Incoming Call Controls */}
          {status === 'ringing' && (
            <>
              <button
                onClick={onDecline}
                className="p-4 bg-red-600 rounded-full hover:bg-red-700 transition-colors"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <button
                onClick={onAnswer}
                className="p-4 bg-green-600 rounded-full hover:bg-green-700 transition-colors"
              >
                <Phone className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Active Call Controls */}
          {(status === 'calling' || status === 'connected') && (
            <>
              {/* Mute Button */}
              <button
                onClick={onToggleMute}
                className={`p-4 rounded-full transition-colors ${
                  isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>

              {/* Video Toggle (for video calls) */}
              {callType === 'video' && onToggleVideo && (
                <button
                  onClick={onToggleVideo}
                  className={`p-4 rounded-full transition-colors ${
                    isVideoOff ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </button>
              )}

              {/* End Call Button */}
              <button
                onClick={onEnd}
                className="p-4 bg-red-600 rounded-full hover:bg-red-700 transition-colors"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallInterface;