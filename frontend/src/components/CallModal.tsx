import React, { useEffect, useRef, useState } from 'react';

interface CallModalProps {
  conversationId: number;
  contactName: string;
  callType: 'voice' | 'video';
  isIncoming: boolean;
  onClose: () => void;
  sendSignal: (payload: any) => void;
  incomingOffer?: any;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CallModal: React.FC<CallModalProps> = ({
  conversationId,
  contactName,
  callType,
  isIncoming,
  onClose,
  sendSignal,
  incomingOffer,
}) => {
  const [callStatus, setCallStatus] = useState<'ringing' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'ringing'
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Initialize WebRTC Media Stream
  useEffect(() => {
    let active = true;

    const setupMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video',
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Handle remote stream
        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setCallStatus('connected');
          }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({
              type: 'call.ice-candidate',
              conversation_id: conversationId,
              payload: event.candidate,
            });
          }
        };

        // If initiating call, create and send offer
        if (!isIncoming) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({
            type: 'call.offer',
            conversation_id: conversationId,
            call_type: callType,
            payload: offer,
          });
        }
      } catch (err) {
        console.error('Failed to get media devices or establish call', err);
        setCallStatus('ended');
      }
    };

    setupMedia();

    return () => {
      active = false;
      cleanup();
    };
  }, []);

  // Answer call if incoming offer accepted
  const handleAcceptCall = async () => {
    const pc = peerConnectionRef.current;
    if (pc && incomingOffer) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          type: 'call.answer',
          conversation_id: conversationId,
          payload: answer,
        });
        setCallStatus('connected');
      } catch (err) {
        console.error('Failed to answer call', err);
      }
    }
  };

  const handleEndCall = () => {
    sendSignal({
      type: 'call.end',
      conversation_id: conversationId,
    });
    setCallStatus('ended');
    cleanup();
    onClose();
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle Camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Duration timer
  useEffect(() => {
    let timer: number;
    if (callStatus === 'connected') {
      timer = window.setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContainer}>
        {/* Top Header */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.callerTitle}>{contactName}</h3>
            <span style={styles.callBadge}>
              {callType === 'video' ? 'Encrypted Video Call' : 'Encrypted Voice Call'}
              {' • '}
              {callStatus === 'ringing' ? 'Calling...' : formatDuration(callDuration)}
            </span>
          </div>
          <span style={styles.secureIndicator}>TLS / WebRTC E2EE</span>
        </div>

        {/* Video Stage */}
        <div style={styles.videoStage}>
          {/* Remote Video Stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              ...styles.remoteVideo,
              display: callType === 'video' ? 'block' : 'none',
            }}
          />

          {callType === 'voice' && (
            <div style={styles.voicePlaceholder}>
              <div style={styles.voiceAvatar}>
                {contactName.charAt(0).toUpperCase()}
              </div>
              <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
                {callStatus === 'connected' ? 'Voice connected' : 'Connecting audio...'}
              </p>
            </div>
          )}

          {/* Local PiP Video Stream */}
          {callType === 'video' && (
            <div style={styles.localPipWrapper}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={styles.localVideo}
              />
              <span style={styles.pipLabel}>You</span>
            </div>
          )}
        </div>

        {/* Controls Toolbar */}
        <div style={styles.toolbar}>
          {isIncoming && callStatus === 'ringing' ? (
            <div style={styles.incomingActions}>
              <button onClick={handleAcceptCall} style={styles.acceptButton}>
                Accept Call
              </button>
              <button onClick={handleEndCall} style={styles.hangupButton}>
                Decline
              </button>
            </div>
          ) : (
            <div style={styles.controlsRow}>
              <button
                onClick={toggleMute}
                style={isMuted ? { ...styles.toolBtn, ...styles.toolBtnActive } : styles.toolBtn}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? 'Mic Off' : 'Mute'}
              </button>

              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  style={isVideoOff ? { ...styles.toolBtn, ...styles.toolBtnActive } : styles.toolBtn}
                  title={isVideoOff ? 'Turn video on' : 'Turn video off'}
                >
                  {isVideoOff ? 'Camera Off' : 'Camera'}
                </button>
              )}

              <button onClick={handleEndCall} style={styles.hangupButton}>
                End Call
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(5, 10, 20, 0.85)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContainer: {
    backgroundColor: '#111827',
    border: '1px solid #374151',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '720px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #1f2937',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1f2937',
  },
  callerTitle: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  callBadge: {
    fontSize: '0.75rem',
    color: '#38bdf8',
    fontWeight: '500',
  },
  secureIndicator: {
    fontSize: '0.6875rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#064e3b',
    color: '#34d399',
    fontWeight: '600',
  },
  videoStage: {
    height: '420px',
    backgroundColor: '#030712',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  voicePlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceAvatar: {
    width: '84px',
    height: '84px',
    borderRadius: '50%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '2.5rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(2, 132, 199, 0.4)',
  },
  localPipWrapper: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    width: '140px',
    height: '105px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '2px solid #38bdf8',
    backgroundColor: '#1f2937',
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
  },
  localVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  pipLabel: {
    position: 'absolute',
    bottom: '4px',
    left: '6px',
    fontSize: '0.625rem',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: '1px 4px',
    borderRadius: '2px',
    color: '#ffffff',
  },
  toolbar: {
    padding: '1.25rem',
    backgroundColor: '#1f2937',
    borderTop: '1px solid #374151',
    display: 'flex',
    justifyContent: 'center',
  },
  controlsRow: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  incomingActions: {
    display: 'flex',
    gap: '1.5rem',
  },
  toolBtn: {
    padding: '0.625rem 1rem',
    borderRadius: '8px',
    border: '1px solid #4b5563',
    backgroundColor: '#374151',
    color: '#f3f4f6',
    fontSize: '0.8125rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toolBtnActive: {
    backgroundColor: '#991b1b',
    borderColor: '#ef4444',
    color: '#ffffff',
  },
  acceptButton: {
    padding: '0.75rem 1.75rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.4)',
  },
  hangupButton: {
    padding: '0.625rem 1.5rem',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '0.8125rem',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
  },
};
