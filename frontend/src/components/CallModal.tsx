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

// Generate live media stream, with an active animated canvas video fallback if camera is busy or unavailable
async function getMediaStreamWithFallback(
  callType: 'voice' | 'video',
  userName: string
): Promise<{ stream: MediaStream; notice: string | null }> {
  // 1. Try real physical camera/microphone
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    return { stream: s, notice: null };
  } catch (err1) {
    console.warn('Direct camera/mic access failed or busy, trying audio-only first:', err1);
  }

  // 2. Try audio-only if video failed
  let audioTrack: MediaStreamTrack | null = null;
  try {
    const a = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioTrack = a.getAudioTracks()[0] || null;
  } catch (_) {}

  // 3. For video calls where webcam was busy (e.g. 2 tabs testing on 1 computer), generate active animated canvas video
  if (callType === 'video') {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let frame = 0;

    const renderAnim = () => {
      if (!ctx) return;
      frame++;
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#0284c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      // Pulsing circle
      const r = 60 + Math.sin(frame * 0.1) * 8;
      ctx.beginPath();
      ctx.arc(320, 210, r, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();

      // Avatar letter
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((userName || 'U').charAt(0).toUpperCase(), 320, 210);

      // Label
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(userName || 'FortiConnect Video', 320, 310);

      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('Live WebRTC Video Stream', 320, 340);
    };

    renderAnim();
    const timer = setInterval(renderAnim, 50);

    const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(20) : new MediaStream();
    canvasStream.getVideoTracks().forEach((track: any) => {
      const origStop = track.stop ? track.stop.bind(track) : () => {};
      track.stop = () => {
        clearInterval(timer);
        origStop();
      };
    });

    if (audioTrack) {
      canvasStream.addTrack(audioTrack);
    }

    return {
      stream: canvasStream,
      notice: 'Camera in use or unavailable. Streaming live animated video avatar.',
    };
  }

  // 4. Voice call without mic
  const stream = new MediaStream();
  if (audioTrack) stream.addTrack(audioTrack);
  return { stream, notice: audioTrack ? null : 'No microphone detected' };
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
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<any[]>([]);
  const ringtoneRef = useRef<RingtonePlayer>(new RingtonePlayer());
  const isCleanedUpRef = useRef<boolean>(false);

  // Pure cleanup method
  const cleanup = useCallback(() => {
    if (isCleanedUpRef.current) return;
    isCleanedUpRef.current = true;
    ringtoneRef.current.stop();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

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

  // Flush queued candidates once remote description is set
  const drainPendingIceCandidates = async (pc: RTCPeerConnection) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const candData = pendingIceCandidatesRef.current.shift();
      if (candData) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candData));
        } catch (err) {
          console.warn('[WebRTC] Failed to add queued ICE candidate', err);
        }
      }
    }
  };

  // Synchronous WebRTC signal handler
  const handleIncomingSignal = useCallback(
    async (signal: any) => {
      if (!signal || signal.conversation_id !== conversationId) return;

      const pc = peerConnectionRef.current;

      if (signal.type === 'call.answer') {
        if (pc && (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable')) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
            await drainPendingIceCandidates(pc);
            setCallStatus('connected');
          } catch (err) {
            console.error('[WebRTC] Failed to set remote answer description:', err);
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
            console.warn('[WebRTC] Error adding ICE candidate:', err);
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

  // Guarantee srcObject is bound and playing on every render pass
  useEffect(() => {
    if (localStreamRef.current && localVideoRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    }
    if (remoteStreamRef.current) {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
        remoteAudioRef.current.play().catch(() => {});
      }
    }
  });

  // Setup WebRTC connection once on mount
  useEffect(() => {
    let active = true;

    const setupConnection = async () => {
      try {
        const { stream, notice } = await getMediaStreamWithFallback(callType, 'You');
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (notice) setMediaNotice(notice);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Remote track arrival
        pc.ontrack = (event) => {
          console.log('[WebRTC] Received remote track:', event.track.kind);
          let rStream = event.streams && event.streams[0];
          if (!rStream) {
            if (!remoteStreamRef.current) {
              remoteStreamRef.current = new MediaStream();
            }
            remoteStreamRef.current.addTrack(event.track);
            rStream = remoteStreamRef.current;
          } else {
            remoteStreamRef.current = rStream;
          }

          if (event.track.kind === 'video') {
            setHasRemoteVideo(true);
          }
          setCallStatus('connected');

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = rStream;
            remoteVideoRef.current.play().catch(() => {});
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = rStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        // ICE candidate handler — serialize as explicit plain JSON object
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({
              type: 'call.ice-candidate',
              conversation_id: conversationId,
              payload: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: event.candidate.usernameFragment,
              },
            });
          }
        };

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
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === 'video',
          });
          await pc.setLocalDescription(offer);
          sendSignal({
            type: 'call.offer',
            conversation_id: conversationId,
            call_type: callType,
            payload: {
              type: offer.type,
              sdp: offer.sdp,
            },
          });
        }
      } catch (err) {
        console.error('[WebRTC] Setup failed:', err);
      }
    };

    setupConnection();

    return () => {
      active = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        payload: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });

      setCallStatus('connected');
    } catch (err) {
      console.error('[WebRTC] Failed to answer call:', err);
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

  const showVideoPlayer = callType === 'video' && hasRemoteVideo && callStatus === 'connected';

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
              display: showVideoPlayer ? 'block' : 'none',
            }}
          />

          {/* Voice / Connecting Placeholder */}
          {!showVideoPlayer && (
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
                    ? 'Negotiating video stream...'
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
