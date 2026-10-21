import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CallModalProps {
  conversationId: number;
  contactName: string;
  callType: 'voice' | 'video';
  isIncoming: boolean;
  onClose: () => void;
  sendSignal: (payload: any) => void;
  incomingOffer?: any;
  onRegisterSignalListener?: (listener: (signal: any) => void) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

// Web Audio API phone ringtone & dial tone synthesizer
class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;

  start(isIncoming: boolean) {
    this.stop();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const playBurst = () => {
        if (!this.ctx || this.ctx.state === 'closed') return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        const now = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // 440Hz + 480Hz dual frequency
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(isIncoming ? 0.2 : 0.08, now + 0.05);
        gain.gain.linearRampToValueAtTime(isIncoming ? 0.2 : 0.08, now + 1.2);
        gain.gain.linearRampToValueAtTime(0, now + 1.25);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.3);
      };

      playBurst();
      this.intervalId = setInterval(playBurst, isIncoming ? 2800 : 3500);
    } catch (e) {
      console.warn('Ringtone sound could not be initialized', e);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (e) {}
      this.ctx = null;
    }
  }
}

export const CallModal: React.FC<CallModalProps> = ({
  conversationId,
  contactName,
  callType,
  isIncoming,
  onClose,
  sendSignal,
  incomingOffer,
  onRegisterSignalListener,
}) => {
  const [callStatus, setCallStatus] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'voice');
  const [callDuration, setCallDuration] = useState(0);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<any[]>([]);
  const ringtoneRef = useRef<RingtonePlayer>(new RingtonePlayer());

  const cleanup = useCallback(() => {
    ringtoneRef.current.stop();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, [localStream]);

  // Ringtone playback lifecycle
  useEffect(() => {
    if (callStatus === 'ringing') {
      ringtoneRef.current.start(isIncoming);
    } else {
      ringtoneRef.current.stop();
    }
    return () => {
      ringtoneRef.current.stop();
    };
  }, [callStatus, isIncoming]);

  // Helper: Flush queued ICE candidates after remote description is set
  const drainPendingIceCandidates = async (pc: RTCPeerConnection) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidateData = pendingIceCandidatesRef.current.shift();
      if (candidateData) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
        } catch (err) {
          console.warn('Failed to add queued ICE candidate', err);
        }
      }
    }
  };

  // Direct synchronous signal handler
  const handleIncomingSignal = useCallback(
    async (signal: any) => {
      if (!signal || signal.conversation_id !== conversationId) return;

      const pc = peerConnectionRef.current;

      if (signal.type === 'call.answer') {
        if (pc && pc.signalingState === 'have-local-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            await drainPendingIceCandidates(pc);
            setCallStatus('connected');
          } catch (err) {
            console.error('Failed to set remote answer on caller', err);
          }
        }
      } else if (signal.type === 'call.ice-candidate') {
        const candData = signal.payload;
        if (!candData) return;

        if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
          pendingIceCandidatesRef.current.push(candData);
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candData));
          } catch (err) {
            console.warn('Failed to add incoming ICE candidate', err);
          }
        }
      } else if (signal.type === 'call.end') {
        setCallStatus('ended');
        cleanup();
        setTimeout(onClose, 600);
      }
    },
    [conversationId, cleanup, onClose]
  );

  // Register signal listener with parent ChatPage
  useEffect(() => {
    if (onRegisterSignalListener) {
      onRegisterSignalListener(handleIncomingSignal);
    }
  }, [onRegisterSignalListener, handleIncomingSignal]);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Attach remote stream to video & audio elements
  useEffect(() => {
    if (remoteStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch((e) => console.warn('Remote video playback error', e));
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch((e) => console.warn('Remote audio playback error', e));
      }
    }
  }, [remoteStream, callStatus]);

  // Initialize WebRTC Peer Connection and Local Media
  useEffect(() => {
    let active = true;

    const setupConnection = async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video',
          });
        } catch (e1) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setMediaNotice('Camera unavailable, joined with microphone audio');
          } catch (e2) {
            console.warn('No physical media devices available, using empty MediaStream', e2);
            stream = new MediaStream();
            setMediaNotice('Simulated media connection (no camera/mic detected)');
          }
        }

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setLocalStream(stream);

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add tracks to PeerConnection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Remote track handler
        pc.ontrack = (event) => {
          console.log('[WebRTC] Received remote track:', event.track.kind);
          let rStream = event.streams && event.streams[0];
          if (!rStream) {
            rStream = new MediaStream([event.track]);
          }
          setRemoteStream(rStream);
          setCallStatus('connected');
        };

        // ICE candidate handler
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({
              type: 'call.ice-candidate',
              conversation_id: conversationId,
              payload: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
            });
          }
        };

        // Connection state tracking
        pc.onconnectionstatechange = () => {
          console.log('[WebRTC] Connection state:', pc.connectionState);
          if (pc.connectionState === 'connected') {
            setCallStatus('connected');
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE Connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setCallStatus('connected');
          }
        };

        // Caller initiates offer
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
        console.error('[WebRTC] Setup failed', err);
      }
    };

    setupConnection();

    return () => {
      active = false;
      cleanup();
    };
  }, [callType, conversationId, isIncoming, sendSignal, cleanup]);

  // Callee accepts incoming call
  const handleAcceptCall = async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !incomingOffer) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      await drainPendingIceCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: 'call.answer',
        conversation_id: conversationId,
        payload: answer,
      });

      setCallStatus('connected');
    } catch (err) {
      console.error('[WebRTC] Failed to answer call', err);
    }
  };

  const handleEndCall = () => {
    sendSignal({
      type: 'call.end',
      conversation_id: conversationId,
    });
    setCallStatus('ended');
    cleanup();
    setTimeout(onClose, 400);
  };

  // Toggle Mute
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle Camera
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Call duration counter
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

  const isVideoAvailable = callType === 'video' && remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div style={styles.modalOverlay}>
      <div className="fc-call-modal-box" style={styles.modalContainer}>
        {/* Top Header */}
        <div style={styles.header}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.25rem' }}>
                {callType === 'video' ? '📹' : '📞'}
              </span>
              <h3 style={styles.callerTitle}>{contactName}</h3>
            </div>
            <span style={styles.callBadge}>
              {callType === 'video' ? 'Encrypted Video Call' : 'Encrypted Voice Call'}
              {' • '}
              {callStatus === 'ringing'
                ? isIncoming
                  ? 'Incoming call...'
                  : 'Ringing employee...'
                : callStatus === 'connected'
                ? formatDuration(callDuration)
                : 'Call Ended'}
            </span>
          </div>
          <span style={styles.secureIndicator}>TLS / WebRTC E2EE</span>
        </div>

        {/* Notice banner if hardware fallback was applied */}
        {mediaNotice && (
          <div style={styles.noticeBar}>
            <span>ℹ️ {mediaNotice}</span>
          </div>
        )}

        {/* Video / Audio Stage */}
        <div style={styles.videoStage}>
          {/* Remote Audio Track (always attached so sound is guaranteed) */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Remote Video Stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              ...styles.remoteVideo,
              display: isVideoAvailable && callStatus === 'connected' ? 'block' : 'none',
            }}
          />

          {/* Voice / Connecting Placeholder */}
          {(!isVideoAvailable || callStatus !== 'connected') && (
            <div style={styles.voicePlaceholder}>
              <div
                style={{
                  ...styles.voiceAvatar,
                  animation: callStatus === 'ringing' ? 'pulse 1.8s infinite' : 'none',
                }}
              >
                {contactName.charAt(0).toUpperCase()}
              </div>
              <h4 style={{ margin: '1rem 0 0.25rem', color: '#f8fafc', fontSize: '1.2rem' }}>
                {contactName}
              </h4>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                {callStatus === 'ringing'
                  ? isIncoming
                    ? 'Incoming Call from Employee...'
                    : 'Ringing employee devices...'
                  : callStatus === 'connected'
                  ? callType === 'video'
                    ? 'Connecting video stream...'
                    : 'Voice Call Connected'
                  : 'Call Ended'}
              </p>
            </div>
          )}

          {/* Local PiP Video Stream */}
          {callType === 'video' && (
            <div className="fc-call-pip-box" style={styles.localPipWrapper}>
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
                <span style={{ marginRight: '0.5rem', fontSize: '1.1rem' }}>📞</span>
                Accept Call
              </button>
              <button onClick={handleEndCall} style={styles.hangupButton}>
                <span style={{ marginRight: '0.5rem', fontSize: '1.1rem' }}>✕</span>
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
                {isMuted ? '🔇 Mic Off' : '🎤 Mute'}
              </button>

              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  style={isVideoOff ? { ...styles.toolBtn, ...styles.toolBtnActive } : styles.toolBtn}
                  title={isVideoOff ? 'Turn video on' : 'Turn video off'}
                >
                  {isVideoOff ? '🚫 Camera Off' : '📹 Camera'}
                </button>
              )}

              <button onClick={handleEndCall} style={styles.hangupButton}>
                <span style={{ marginRight: '0.5rem', fontSize: '1.1rem' }}>☎</span>
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
    backgroundColor: 'rgba(5, 10, 20, 0.88)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modalContainer: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '18px',
    width: '92%',
    maxWidth: '700px',
    boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.85), 0 0 25px rgba(2, 132, 199, 0.25)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '1.2rem 1.5rem',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  callerTitle: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#f8fafc',
  },
  callBadge: {
    fontSize: '0.8rem',
    color: '#38bdf8',
    fontWeight: '500',
    marginTop: '0.2rem',
    display: 'block',
  },
  secureIndicator: {
    fontSize: '0.7rem',
    padding: '0.3rem 0.6rem',
    borderRadius: '6px',
    backgroundColor: '#064e3b',
    color: '#34d399',
    fontWeight: '700',
    letterSpacing: '0.04em',
    border: '1px solid #059669',
  },
  noticeBar: {
    padding: '0.5rem 1rem',
    backgroundColor: '#1e1b4b',
    color: '#c7d2fe',
    fontSize: '0.8rem',
    textAlign: 'center',
    borderBottom: '1px solid #312e81',
  },
  videoStage: {
    height: '400px',
    backgroundColor: '#020617',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    textAlign: 'center',
  },
  voiceAvatar: {
    width: '94px',
    height: '94px',
    borderRadius: '50%',
    backgroundColor: '#0284c7',
    color: '#ffffff',
    fontSize: '2.6rem',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 35px rgba(2, 132, 199, 0.5)',
  },
  localPipWrapper: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    width: '144px',
    height: '108px',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '2px solid #38bdf8',
    backgroundColor: '#1e293b',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.6)',
    zIndex: 10,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: '1px 5px',
    borderRadius: '3px',
    color: '#ffffff',
    fontWeight: '600',
  },
  toolbar: {
    padding: '1.25rem',
    backgroundColor: '#1e293b',
    borderTop: '1px solid #334155',
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
    alignItems: 'center',
  },
  toolBtn: {
    padding: '0.65rem 1.1rem',
    borderRadius: '10px',
    border: '1px solid #475569',
    backgroundColor: '#334155',
    color: '#f8fafc',
    fontSize: '0.85rem',
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
    padding: '0.8rem 2rem',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#16a34a',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    boxShadow: '0 4px 16px rgba(22, 163, 74, 0.5)',
    transition: 'transform 0.15s ease',
  },
  hangupButton: {
    padding: '0.8rem 2rem',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '0.95rem',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    boxShadow: '0 4px 16px rgba(220, 38, 38, 0.5)',
    transition: 'transform 0.15s ease',
  },
};
