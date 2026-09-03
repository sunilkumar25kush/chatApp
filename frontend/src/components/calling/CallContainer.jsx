import { useCall } from '../../context/CallContext';
import CallRoom from './CallRoom';
import MinimizedCallBar from './MinimizedCallBar';
import IncomingCallModal from './IncomingCallModal';

export default function CallContainer() {
  const { callState, isCallModalOpen, isCallMinimized } = useCall();

  const isCallActive = callState === 'calling' || callState === 'connected' || callState === 'reconnecting';

  return (
    <>
      {/* 1. Global Incoming Ringing Prompt */}
      <IncomingCallModal />

      {/* 2. Full-Screen Desktop / Mobile Call Room Interface */}
      {isCallActive && isCallModalOpen && !isCallMinimized && <CallRoom />}

      {/* 3. Minimized Picture-in-Picture Floating Bar */}
      {isCallActive && isCallMinimized && <MinimizedCallBar />}
    </>
  );
}
